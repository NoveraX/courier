/**
 * The `courier-server` command, run as a user runs it.
 *
 * It imported `--config` itself: relative to its own install directory, so
 * every relative path failed, and without a TypeScript loader, so a config
 * importing its modules without extensions could not load. It exited 0 when
 * its port was taken, took `3001abc` as a port, had no `--version`, and gave
 * no way to allow a browser app's origin.
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createRequire } from "node:module";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import manifest from "../package.json" with { type: "json" };

const CLI = join(__dirname, "../src/cli.ts");
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

/** A project under the repository's node_modules, so its config resolves the workspace packages. */
function project(serverBlock?: string): string {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-server-tests");
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(join(cache, "project-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src"));
  writeFileSync(
    join(root, "src", "api.ts"),
    'import { courier, defineApi } from "@noverax/courier/define";\n' +
      "const { endpoint } = courier();\n" +
      'export const api = defineApi({ baseURL: "http://127.0.0.1:1", endpoints: { ping: endpoint.get("ping") } });\n',
  );
  const server = serverBlock === undefined ? "" : `, server: ${serverBlock}`;
  writeFileSync(
    join(root, "courier.config.ts"),
    `import { api } from "./src/api";\nexport default { sources: { api }${server} };\n`,
  );
  return root;
}

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

function run(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, ["--import", TSX, CLI, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, NO_COLOR: "1" },
  });
}

/** Start the server in the background and resolve once it answers /health. */
async function serve(cwd: string, ...args: string[]): Promise<string> {
  const child: ChildProcess = spawn(process.execPath, ["--import", TSX, CLI, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: "1" },
  });
  cleanups.push(() => child.kill("SIGKILL"));
  const port = args[args.indexOf("--port") + 1];
  const url = `http://127.0.0.1:${port}`;
  for (let waited = 0; waited < 15_000; waited += 100) {
    try {
      if ((await fetch(`${url}/health`)).ok) return url;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`courier-server did not come up on ${url}`);
}

describe("courier-server", () => {
  it("serves a TypeScript config named relative to the working directory", async () => {
    const root = project();

    const url = await serve(
      root,
      "--config",
      "./courier.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      String(await freePort()),
    );

    expect((await fetch(`${url}/health`)).status).toBe(200);
  }, 30_000);

  it("finds courier.config.ts in the working directory when --config is omitted", async () => {
    const root = project();

    const url = await serve(root, "--host", "127.0.0.1", "--port", String(await freePort()));

    expect((await fetch(`${url}/health`)).status).toBe(200);
  }, 30_000);

  it("names a --config that does not exist", () => {
    const result = run(project(), "--config", "./missing.config.ts");

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("there is no file at");
  });

  it("exits 1 when its port is taken", async () => {
    const root = project();
    const holder = createNetServer();
    const port = await freePort();
    await new Promise<void>((resolve) => holder.listen(port, "127.0.0.1", resolve));
    cleanups.push(() => holder.close());

    const result = run(root, "--host", "127.0.0.1", "--port", String(port));

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(`Port ${port} is already in use`);
  }, 30_000);

  it("admits the origins it is told to allow", async () => {
    const root = project();
    const port = String(await freePort());
    const url = await serve(
      root,
      "--host",
      "127.0.0.1",
      "--port",
      port,
      "--allowed-origins",
      "https://app.example",
    );
    const call = (origin: string) =>
      fetch(`${url}/api/request?_s=api&_m=ping`, { headers: { Origin: origin } });

    expect((await call("https://app.example")).status).not.toBe(403);
    expect((await call("https://evil.example")).status).toBe(403);
  }, 30_000);

  it("serves the host names it is told, from the flag or from the config", async () => {
    const statusFor = (url: string, host: string) =>
      new Promise<number>((resolve, reject) => {
        const { port } = new URL(url);
        httpRequest(
          { host: "127.0.0.1", port, path: "/api/request?_s=api&_m=ping", headers: { host } },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        )
          .on("error", reject)
          .end();
      });
    const flagged = await serve(
      project(),
      "--host",
      "127.0.0.1",
      "--port",
      String(await freePort()),
      "--allowed-hosts",
      "app.example, api.example",
    );
    const configured = await serve(
      project('{ allowedHosts: ["cfg.example"] }'),
      "--host",
      "127.0.0.1",
      "--port",
      String(await freePort()),
    );

    expect(await statusFor(flagged, "api.example")).not.toBe(421);
    expect(await statusFor(flagged, "rebound.example")).toBe(421);
    expect(await statusFor(configured, "cfg.example")).not.toBe(421);
    expect(await statusFor(configured, "app.example")).toBe(421);
  }, 30_000);

  it("applies the body limits the config's server block sets", async () => {
    const root = project("{ maxBodyBytes: 64, maxUploadBytes: 512 }");
    const url = await serve(root, "--host", "127.0.0.1", "--port", String(await freePort()));
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(1024)]), "a.bin");

    const json = await fetch(`${url}/api/request?_s=api&_m=ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(200) }),
    });
    const upload = await fetch(`${url}/api/request?_s=api&_m=ping`, { method: "POST", body: form });

    expect(json.status).toBe(413);
    expect(await json.json()).toMatchObject({ message: "Request body exceeds 64 bytes" });
    expect(upload.status).toBe(413);
    expect(await upload.json()).toMatchObject({ message: "Request body exceeds 512 bytes" });
  }, 30_000);

  it("names a body limit in the config that is not a byte count", () => {
    const result = run(project('{ maxUploadBytes: "10mb" }'));

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("server.maxUploadBytes");
  });

  it("prints its version", () => {
    const result = run(project(), "--version");

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(manifest.version);
  });

  it("refuses a port that is not a number", () => {
    const result = run(project(), "--port", "3001abc");

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('Invalid --port: "3001abc"');
  });
});
