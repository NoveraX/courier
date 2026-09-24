/**
 * Starting Studio, and who it then answers.
 *
 * A held port was reported as "Studio already running" whoever held it,
 * onReady never fired and close() rejected; a config that was missing or
 * broken at start switched hot reload off for the whole session. With port 0
 * Studio reported `:0` and refused its own UI; its sockets took any page on
 * any site; and every start appended to the project's .gitignore.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createNetServer, type Server } from "node:net";
import { join } from "node:path";
import { io as connect } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import { createStudioServer } from "../src/server";
import type { StudioServer } from "../src/server/types";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A project directory under the repository's node_modules, so its config resolves the workspace packages. */
function project(): string {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, "project-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

function start(options: Parameters<typeof createStudioServer>[0]): StudioServer {
  const server = createStudioServer(options);
  cleanups.push(() => server.close());
  return server;
}

describe("createStudioServer on a port someone else holds", () => {
  it("says so, never reports ready, and still closes", async () => {
    const port = await freePort();
    const holder: Server = createNetServer();
    await new Promise<void>((resolve) => holder.listen(port, "127.0.0.1", resolve));
    cleanups.push(() => new Promise<void>((resolve) => holder.close(() => resolve())));
    let ready = false;

    const failure = await new Promise<Error>((resolve) => {
      const server = createStudioServer({
        port,
        host: "127.0.0.1",
        projectRoot: project(),
        onReady: () => {
          ready = true;
        },
        onError: resolve,
      });
      cleanups.push(() => server.close());
    });

    expect(failure.message).toContain(`Port ${port}`);
    expect(ready).toBe(false);
  });
});

describe("a config created after Studio started", () => {
  it("is picked up without a restart", async () => {
    const port = await freePort();
    const root = project();
    const url = await new Promise<string>((resolve) => {
      start({ port, host: "127.0.0.1", projectRoot: root, onReady: resolve });
    });
    const ui = connect(`${url}/ui`, { transports: ["websocket"] });
    cleanups.push(() => {
      ui.disconnect();
    });
    await new Promise<void>((resolve) => ui.once("connect", () => resolve()));
    const updated = new Promise<{ configFile: string }>((resolve) => ui.once("config:update", resolve));

    writeFileSync(
      join(root, "courier.config.ts"),
      'import { defineApi } from "@noverax/courier/define";\n' +
        'export default { sources: { api: defineApi({ baseURL: "https://api.example", endpoints: {} }) } };\n',
    );

    const update = await updated;
    expect(update.configFile).toContain("courier.config.ts");
  }, 15_000);
});

/** Connect a socket with the headers a browser page would send, and report whether Studio took it. */
function connects(url: string, namespace: string, origin?: string): Promise<boolean> {
  const socket = connect(`${url}${namespace}`, {
    transports: ["websocket"],
    reconnection: false,
    ...(origin === undefined ? {} : { extraHeaders: { Origin: origin } }),
  });
  cleanups.push(() => {
    socket.disconnect();
  });
  return new Promise((resolve) => {
    socket.once("connect", () => resolve(true));
    socket.once("connect_error", () => resolve(false));
  });
}

function started(root: string, port = 0): Promise<{ url: string; server: StudioServer }> {
  return new Promise((resolve) => {
    const server = start({
      port,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: (url) => resolve({ url, server }),
    });
  });
}

describe("Studio on a port the system picked", () => {
  it("reports the port it listens on, and answers its own UI there", async () => {
    const { url, server } = await started(project());

    expect(url).not.toMatch(/:0$/);
    expect(server.url).toBe(url);
    const reply = await fetch(`${url}/api/sessions/list`, {
      method: "POST",
      headers: { Origin: url, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(reply.status).not.toBe(403);
  });
});

describe("Studio's sockets", () => {
  it("refuse a page on another site, on every namespace", async () => {
    const { url } = await started(project(), await freePort());

    expect(await connects(url, "/ui", "https://evil.example")).toBe(false);
    expect(await connects(url, "/runtime", "https://evil.example")).toBe(false);
  });

  it("take the UI from Studio's own page only", async () => {
    const { url } = await started(project(), await freePort());

    expect(await connects(url, "/ui", url)).toBe(true);
    expect(await connects(url, "/ui", "http://localhost:5173")).toBe(false);
  });

  it("take a runtime from an app page on this machine, or from a process", async () => {
    const { url } = await started(project(), await freePort());

    expect(await connects(url, "/runtime", "http://localhost:5173")).toBe(true);
    expect(await connects(url, "/runtime")).toBe(true);
  });
});

describe("Studio in a project", () => {
  it("leaves the project's .gitignore alone", async () => {
    const root = project();
    writeFileSync(join(root, ".gitignore"), "node_modules\n");

    await started(root);

    expect(readFileSync(join(root, ".gitignore"), "utf-8")).toBe("node_modules\n");
  });
});
