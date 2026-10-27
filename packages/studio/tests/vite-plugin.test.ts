/**
 * The Studio Vite plugin, driven through a real Vite dev server.
 *
 * It does not inject an inline `<script type="module">` from
 * `transformIndexHtml`: Vite does not rewrite imports in a tag added that way,
 * so the browser would be handed the bare
 * `@noverax/courier-studio-core/runtime`, and frameworks that render their own
 * HTML — SvelteKit, React Router, SolidStart — never run that hook.
 *
 * It reads courier.config from Vite's root, not the working directory, so
 * `vite apps/web`, run from above the app, sends the browser to the Studio
 * address the app's config names. And when the dev server starts listening
 * it tells the app that address, where the Playground sends its proxy calls;
 * in middleware mode, the address of the app's own server, as the socket of
 * the first request it hands Vite tells.
 *
 * The page gets the runtime's browser build whatever the app's resolve
 * conditions are. SolidStart 2 names its own for every environment, the
 * client's too, and leaves out `browser`: resolved through them, the runtime
 * Vite pre-bundled for the page was the server's, which reaches Node's
 * diagnostics channel and threw as the page attached.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { DEV_SERVER_ORIGIN_ENV } from "@noverax/courier/internal";
import { createServer, type ViteDevServer } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

import { courierStudio } from "../src/plugins/vite";

const VIRTUAL_URL = "/@id/__x00__virtual:courier-studio-init";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  setAppOrigin(undefined);
  vi.unstubAllEnvs();
});

/** A project under the repository's node_modules, so its config resolves the workspace packages. */
function project(config?: string): string {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, "vite-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "index.html"), '<script type="module" src="/main.js"></script>\n');
  writeFileSync(join(dir, "main.js"), 'console.log("app");\n');
  if (config !== undefined) writeFileSync(join(dir, "courier.config.ts"), config);
  return dir;
}

async function serve(root: string, enabled?: boolean): Promise<ViteDevServer> {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true, ws: false },
    plugins: [courierStudio(enabled === undefined ? {} : { enabled })],
  });
  cleanups.push(() => server.close());
  return server;
}

/** A dev server that pre-bundles into the project's own cache, under the client resolve conditions given. */
async function servePrebundling(
  conditions?: string[],
): Promise<{ server: ViteDevServer; deps: string }> {
  const root = project();
  const cacheDir = join(root, ".vite");
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    cacheDir,
    ...(conditions && { resolve: { conditions } }),
    server: { middlewareMode: true, ws: false },
    plugins: [courierStudio({})],
  });
  cleanups.push(() => server.close());
  return { server, deps: join(cacheDir, "deps") };
}

/**
 * Which builds of the runtime are among what Vite pre-bundled, once the one
 * the connect module imports is written: the browser build watches Resource
 * Timing, the server build Node's diagnostics channel.
 */
async function prebundledRuntimeBuilds(
  server: ViteDevServer,
  deps: string,
): Promise<{ browser: boolean; server: boolean }> {
  const snippet = await server.transformRequest("virtual:courier-studio-init");
  const runtime = /from "([^"]+)"/.exec(snippet?.code ?? "")?.[1];
  if (runtime === undefined) throw new Error("The connect module imports no runtime");
  /* Serving a pre-bundled module waits until Vite has written the bundle. */
  await server.transformRequest(runtime);
  const code = readdirSync(deps)
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFileSync(join(deps, file), "utf8"))
    .join("\n");
  return {
    browser: code.includes("observeBrowserHttpVersions"),
    server: code.includes("node:diagnostics_channel"),
  };
}

/* The app's own server, handing every request to Vite first, as React Router's custom server does. */
async function appServerFor(vite: ViteDevServer): Promise<number> {
  const app = createHttpServer((req, res) =>
    vite.middlewares(req, res, () => {
      res.statusCode = 404;
      res.end();
    }),
  );
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => app.close(() => resolve())));
  return (app.address() as AddressInfo).port;
}

function sendTo(port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sent = request({ host: "127.0.0.1", port, path: "/", headers: { host } }, (res) => {
      res.resume();
      res.on("end", () => resolve());
    });
    sent.on("error", reject);
    sent.end();
  });
}

describe("courierStudio() for Vite", () => {
  it("loads the connect module from Vite's own client, which every page loads", async () => {
    const server = await serve(project());

    const client = await server.transformRequest("/@vite/client");

    expect(client?.code).toContain(`import("${VIRTUAL_URL}")`);
  });

  it("serves the connect module with the runtime import resolved for the browser", async () => {
    const server = await serve(project());

    const snippet = await server.transformRequest("virtual:courier-studio-init");

    expect(snippet?.code).toContain('attachRuntime("vite-browser")');
    expect(snippet?.code).not.toContain('from "@noverax/courier-studio-core/runtime"');
    expect(snippet?.code).toMatch(/from "\/[^"]*courier-studio-core[^"]*"/);
  });

  it("pre-bundles the runtime's browser build for the page", async () => {
    const { server, deps } = await servePrebundling();

    const builds = await prebundledRuntimeBuilds(server, deps);

    expect(builds).toEqual({ browser: true, server: false });
  });

  it("pre-bundles the runtime's browser build where the client's conditions leave out browser, as SolidStart's do", async () => {
    const { server, deps } = await servePrebundling(["solid", "development", "generic"]);

    const builds = await prebundledRuntimeBuilds(server, deps);

    expect(builds).toEqual({ browser: true, server: false });
  });

  it("connects to the Studio the config in Vite's root names, wherever Vite was started", async () => {
    const root = project("export default { studio: { port: 7125 } };\n");
    const server = await serve(root);

    const snippet = await server.transformRequest("virtual:courier-studio-init");

    expect(process.cwd()).not.toBe(root);
    expect(snippet?.code).toContain('"http://localhost:7125"');
  });

  it("finds the config above Vite's root, as when root names the app's source directory", async () => {
    const app = project("export default { studio: { port: 7126 } };\n");
    const root = join(app, "src");
    mkdirSync(root);
    writeFileSync(join(root, "index.html"), '<script type="module" src="/main.js"></script>\n');
    const server = await serve(root);

    const snippet = await server.transformRequest("virtual:courier-studio-init");

    expect(snippet?.code).toContain('"http://localhost:7126"');
  });

  it("has Vite pre-bundle Courier's browser modules the app has, so the first page that imports one is not reloaded", async () => {
    const server = await serve(project());

    expect(server.config.optimizeDeps.include).toEqual(
      expect.arrayContaining([
        "@noverax/courier",
        "@noverax/courier/define",
        "@noverax/courier-react",
      ]),
    );
  });

  it("injects nothing when disabled", async () => {
    const server = await serve(project(), false);

    const client = await server.transformRequest("/@vite/client");

    expect(client?.code).not.toContain("courier-studio-init");
  });

  it("tells the app where the dev server listens, the moment it starts, whatever a request names", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(DEV_SERVER_ORIGIN_ENV, "");
    delete process.env[DEV_SERVER_ORIGIN_ENV];
    const server = await createServer({
      root: project(),
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, ws: false },
      plugins: [courierStudio({})],
    });
    cleanups.push(() => server.close());

    await server.listen();
    const listening = server.httpServer;
    if (!listening) throw new Error("the dev server did not listen");
    const { port } = listening.address() as AddressInfo;
    await sendTo(port, "localhost:9999");

    expect(getAppOrigin()).toBe(`http://localhost:${port}`);
    expect(process.env[DEV_SERVER_ORIGIN_ENV]).toBe(`http://localhost:${port}`);
  });

  it("tells nothing in middleware mode until the app's own server hands Vite a request", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await appServerFor(await serve(project()));

    expect(getAppOrigin()).toBeUndefined();
  });

  it("tells, in middleware mode, where the app's own server listens, as the first request's socket says, whatever port it names", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(DEV_SERVER_ORIGIN_ENV, "");
    delete process.env[DEV_SERVER_ORIGIN_ENV];
    const port = await appServerFor(await serve(project()));

    await sendTo(port, "localhost:9999");

    expect(getAppOrigin()).toBe(`http://localhost:${port}`);
    expect(process.env[DEV_SERVER_ORIGIN_ENV]).toBe(`http://localhost:${port}`);
  });

  it("keeps, in middleware mode, an origin the app already has", async () => {
    vi.stubEnv("NODE_ENV", "development");
    setAppOrigin("https://shop.example");
    const port = await appServerFor(await serve(project()));

    await sendTo(port, "localhost:9999");

    expect(getAppOrigin()).toBe("https://shop.example");
  });

  it("leaves server-side transforms alone", async () => {
    const plugin = courierStudio({ enabled: true });
    const transform = plugin.transform as (
      code: string,
      id: string,
      options?: { ssr?: boolean },
    ) => Promise<unknown>;

    const result = await transform("export {}", "/app/node_modules/vite/dist/client/client.mjs", {
      ssr: true,
    });

    expect(result).toBeUndefined();
  });
});
