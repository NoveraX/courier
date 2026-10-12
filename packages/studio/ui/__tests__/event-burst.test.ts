/**
 * @vitest-environment jsdom
 */
/**
 * A burst of traffic reaches the UI as thousands of events within a
 * second, so the store takes them in batches: one store update per event
 * would re-render every subscriber thousands of times and leave the page so
 * busy that it fell tens of seconds behind and lost its socket.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Server } from "socket.io";
import { io } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildBindings, unbind } from "@/socket/socket-bindings";
import { useStudioStore } from "@/store";

const REQUESTS = 2000;

let server: Server | undefined;
let stop: (() => void) | undefined;

function event(
  type: string,
  i: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { id: `r${i}`, type, timestamp: Date.now(), sessionId: "s1", ...extra };
}

async function startStudio(): Promise<{ url: string; io: Server }> {
  const http = createServer();
  const ioServer = new Server(http);
  ioServer.of("/ui");
  server = ioServer;
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const { port } = http.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/ui`, io: ioServer };
}

beforeEach(() => {
  const { settings } = useStudioStore.getState();
  useStudioStore.setState({
    requests: [],
    droppedRequests: 0,
    paused: false,
    settings: { ...settings, toastOnError: false, toastOnSlowRequest: false },
  });
});

afterEach(async () => {
  stop?.();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

describe("a burst of runtime events", () => {
  it("reaches the store in a few updates and finishes every request", {
    timeout: 30_000,
  }, async () => {
    const studio = await startStudio();
    const socket = io(studio.url, { transports: ["websocket"] });
    const bindings = buildBindings(socket, useStudioStore.getState);
    stop = () => {
      unbind(socket, bindings);
      socket.disconnect();
    };
    await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
    let updates = 0;
    const unsubscribe = useStudioStore.subscribe(() => updates++);

    const ui = studio.io.of("/ui");
    for (let i = 0; i < REQUESTS; i++) {
      ui.emit("events", [
        event("request:start", i, { source: "api", method: "list" }),
        event("middleware:enter", i, { requestId: `r${i}`, name: "auth", index: 0 }),
        event("middleware:exit", i, { requestId: `r${i}`, name: "auth", index: 0, duration: 1 }),
        event("request:end", i, { requestId: `r${i}`, status: 200, timing: { total: 1 } }),
      ]);
    }
    await expect
      .poll(() => useStudioStore.getState().requests.filter((r) => r.status === "success").length, {
        timeout: 15_000,
        interval: 50,
      })
      .toBe(REQUESTS);
    unsubscribe();

    expect(
      useStudioStore
        .getState()
        .requests.every((r) => r.middlewareEntries[0]?.status === "completed"),
    ).toBe(true);
    expect(updates).toBeLessThan(REQUESTS / 10);
  });
});
