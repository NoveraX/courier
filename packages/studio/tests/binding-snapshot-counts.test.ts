/**
 * The runtimes and sources the status bar counts, as a running Studio
 * reports them.
 *
 * An app is counted as soon as it connects, and a source it hosts whether
 * or not its definition names a `proxyPath`: an app wired as the adapters'
 * READMEs show — no `proxyPath` — would otherwise stream traffic while the
 * status bar read "0 runtimes · 0 sources" and Welcome's "Verify
 * connection" never completed.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import { createStudioServer } from "../src/server";

interface Snapshot {
  runtimeCount: number;
  sourceCount: number;
  runtimes: Array<{ runtimeId: string; kind: string }>;
}

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function startStudio(): Promise<string> {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(join(cache, "project-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return new Promise<string>((resolve) => {
    const server = createStudioServer({
      port,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
    });
    cleanups.push(() => server.close());
  });
}

async function open(url: string): Promise<Socket> {
  const socket = connect(url, { transports: ["websocket"], reconnection: false });
  cleanups.push(() => {
    socket.disconnect();
  });
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
  return socket;
}

/** A Studio page, with the latest binding snapshot it was sent. */
async function statusBar(studio: string): Promise<{ latest: () => Snapshot | undefined }> {
  const snapshots: Snapshot[] = [];
  const socket = connect(`${studio}/ui`, { transports: ["websocket"], reconnection: false });
  cleanups.push(() => {
    socket.disconnect();
  });
  socket.on("binding:snapshot", (snapshot: Snapshot) => snapshots.push(snapshot));
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
  return { latest: () => snapshots.at(-1) };
}

describe("the runtimes and sources Studio counts", () => {
  it("counts an app that hosts a source with no proxyPath", async () => {
    const studio = await startStudio();
    const page = await statusBar(studio);
    const app = await open(`${studio}/runtime`);

    app.emit("runtime:hello", { runtimeId: "server", kind: "server" });
    app.emit("runtime:announce", { transports: ["http", "sse", "ws"], sources: ["api"] });

    await expect
      .poll(page.latest)
      .toEqual(expect.objectContaining({ runtimeCount: 1, sourceCount: 1 }));
  });

  it("counts an app as soon as it connects, before it hosts anything", async () => {
    const studio = await startStudio();
    const page = await statusBar(studio);
    const app = await open(`${studio}/runtime`);

    app.emit("runtime:hello", { runtimeId: "server", kind: "server" });

    await expect
      .poll(page.latest)
      .toEqual(expect.objectContaining({ runtimeCount: 1, sourceCount: 0 }));
  });

  it("names each connected runtime and whether it runs in a browser", async () => {
    const studio = await startStudio();
    const page = await statusBar(studio);
    const server = await open(`${studio}/runtime`);
    const browser = await open(`${studio}/runtime`);

    server.emit("runtime:hello", { runtimeId: "server", kind: "server" });
    browser.emit("runtime:hello", { runtimeId: "vite-browser", kind: "browser" });

    await expect
      .poll(() => page.latest()?.runtimes)
      .toEqual(
        expect.arrayContaining([
          { runtimeId: "server", kind: "server" },
          { runtimeId: "vite-browser", kind: "browser" },
        ]),
      );
  });

  it("stops counting an app once it disconnects", async () => {
    const studio = await startStudio();
    const page = await statusBar(studio);
    const app = await open(`${studio}/runtime`);
    app.emit("runtime:hello", { runtimeId: "server", kind: "server" });
    app.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    await expect.poll(page.latest).toEqual(expect.objectContaining({ runtimeCount: 1 }));

    app.disconnect();

    await expect
      .poll(page.latest)
      .toEqual(expect.objectContaining({ runtimeCount: 0, sourceCount: 0 }));
  });
});
