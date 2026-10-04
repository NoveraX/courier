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
 * address the app's config names.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer, type ViteDevServer } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import { courierStudio } from "../src/plugins/vite";

const VIRTUAL_URL = "/@id/__x00__virtual:courier-studio-init";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
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

  it("injects nothing when disabled", async () => {
    const server = await serve(project(), false);

    const client = await server.transformRequest("/@vite/client");

    expect(client?.code).not.toContain("courier-studio-init");
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
