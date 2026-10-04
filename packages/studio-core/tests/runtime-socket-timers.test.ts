/**
 * The Studio socket on a platform whose timers are plain numbers — every
 * browser, Deno, and edge workers.
 *
 * `autoUnref` keeps the socket from holding a Node process alive, and
 * socket.io-client then calls `.unref()` on its own timers, which exists
 * only on Node's. So it is asked for only where timers can be unref'd:
 * elsewhere the handshake would throw `this._pingTimeoutTimer.unref is not
 * a function`, and no browser runtime would reach Studio.
 */
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { afterEach, describe, expect, it } from "vitest";

import { connectRuntimeSocket } from "../src/runtime/connect-runtime-socket";

const nodeSetTimeout = globalThis.setTimeout;
const nodeClearTimeout = globalThis.clearTimeout;

/** Timers as a browser hands them out: numbers, with no `unref`. */
function useNumericTimers(): () => void {
  const live = new Map<number, ReturnType<typeof nodeSetTimeout>>();
  let next = 1;
  globalThis.setTimeout = ((fn: () => void, ms?: number) => {
    const id = next++;
    live.set(
      id,
      nodeSetTimeout(() => {
        live.delete(id);
        fn();
      }, ms),
    );
    return id;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => {
    const timer = live.get(id);
    if (timer) nodeClearTimeout(timer);
    live.delete(id);
  }) as unknown as typeof clearTimeout;
  return () => {
    globalThis.setTimeout = nodeSetTimeout;
    globalThis.clearTimeout = nodeClearTimeout;
    for (const timer of live.values()) nodeClearTimeout(timer);
  };
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

async function studio(): Promise<{ url: string; hello: Promise<unknown> }> {
  const http: HttpServer = createServer();
  const io = new Server(http);
  const hello = new Promise<unknown>((resolve) => {
    io.of("/runtime").on("connection", (socket) => socket.on("runtime:hello", resolve));
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => {
    io.close();
  });
  const { port } = http.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, hello };
}

describe("the Studio socket where timers cannot be unref'd", () => {
  it("still connects and says hello", async () => {
    const { url, hello } = await studio();
    cleanups.push(useNumericTimers());
    let dispose: (() => void) | undefined;
    cleanups.push(() => dispose?.());

    await connectRuntimeSocket({ runtimeId: "vite-browser", kind: "browser", studioUrl: url }, [], {
      setDisposer: (fn) => {
        dispose = fn;
      },
      setAnnouncer: () => {},
    });

    await expect(hello).resolves.toEqual({ runtimeId: "vite-browser", kind: "browser" });
  });
});
