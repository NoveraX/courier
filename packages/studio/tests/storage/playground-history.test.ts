/**
 * Studio keeps the Playground history a page sends it, for the project: the
 * next page that connects, and a Studio that restarts, are shown it. It was
 * kept in one browser's storage only.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import { createStudioServer } from "../../src/server/create-studio-server";
import type { StudioServer } from "../../src/server/types";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-playground-history-"));
  mkdirSync(join(dir, "src"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function start(root: string): Promise<StudioServer> {
  const studio = await new Promise<StudioServer>((resolve, reject) => {
    const server = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: () => resolve(server),
      onError: reject,
    });
  });
  cleanups.push(() => studio.close());
  return studio;
}

/** A page that connects, with the histories it is sent. */
async function page(url: string): Promise<{ socket: Socket; sent: unknown[] }> {
  const socket = connect(`${url}/ui`, { transports: ["websocket"], reconnection: false });
  const seen = { socket, sent: [] as unknown[] };
  socket.on("playground:history", (history: unknown) => seen.sent.push(history));
  cleanups.push(() => {
    socket.disconnect();
  });
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
  return seen;
}

const CALL = { id: "e1", rid: "r1", source: "api", method: "list", status: "success", response: [1] };

describe("the Playground history", () => {
  it("is shown to the next page, and after Studio restarts, as a page sent it", async () => {
    const root = project();
    const first = await start(root);
    const sender = await page(first.url);
    await expect.poll(() => sender.sent).toEqual([[]]);

    sender.socket.emit("playground:history:save", [CALL]);
    const next = await page(first.url);
    await expect.poll(() => next.sent).toEqual([[CALL]]);
    await first.close();
    const second = await start(root);
    const afterRestart = await page(second.url);

    await expect.poll(() => afterRestart.sent).toEqual([[CALL]]);
  });

  it("keeps no credential a call sent", async () => {
    const studio = await start(project());
    const sender = await page(studio.url);
    const call = { ...CALL, headers: '{ "Authorization": "Bearer t" }', requestHeaders: { authorization: "Bearer t" } };
    sender.socket.emit("playground:history:save", [call]);

    const next = await page(studio.url);

    await expect.poll(() => JSON.stringify(next.sent)).toContain("[redacted]");
    expect(JSON.stringify(next.sent)).not.toContain("Bearer t");
  });

  it("keeps what it was given, and ignores what is not a history", async () => {
    const studio = await start(project());
    const sender = await page(studio.url);
    sender.socket.emit("playground:history:save", [CALL]);
    sender.socket.emit("playground:history:save", { not: "a list" });

    const next = await page(studio.url);

    await expect.poll(() => next.sent).toEqual([[CALL]]);
  });
});
