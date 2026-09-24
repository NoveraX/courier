/**
 * Starting Studio where things are not ready yet: a port someone else holds,
 * and a project whose config does not exist until after Studio started.
 *
 * A held port was reported as "Studio already running" whoever held it,
 * onReady never fired and close() rejected; a config that was missing or
 * broken at start switched hot reload off for the whole session; and every
 * start appended to the project's .gitignore.
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

describe("Studio in a project", () => {
  it("leaves the project's .gitignore alone", async () => {
    const root = project();
    writeFileSync(join(root, ".gitignore"), "node_modules\n");

    await started(root);

    expect(readFileSync(join(root, ".gitignore"), "utf-8")).toBe("node_modules\n");
  });
});
