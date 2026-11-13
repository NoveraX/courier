/**
 * @vitest-environment jsdom
 *
 * The browser build of the runtime on its socket to Studio, as a page and
 * a Cloudflare Worker run it: it says hello as a browser and tells Studio
 * what the application's adapters announced, and answers none of the calls
 * Studio sends only a runtime that showed it the project's token — the
 * Playground's, a webhook's delivery. A page never has the token: those
 * calls are the server build's, and so is the half of the core they run on,
 * which a page built for development keeps whole once its runtime imports it.
 */
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { announceHosting } from "@noverax/courier/announce";
import { Server, type Socket } from "socket.io";
import { afterEach, describe, expect, it } from "vitest";

import { resetAnnouncements } from "../../core/src/announce/test-support";
import { attachRuntime } from "../src/runtime/attach-runtime-browser";
import { _resetRuntimeHandlesForTests } from "../src/runtime/attach-runtime-core";

const STUDIO_URL_KEY = Symbol.for("courier.studio.url");

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  _resetRuntimeHandlesForTests();
  resetAnnouncements();
  Reflect.deleteProperty(globalThis, STUDIO_URL_KEY);
});

/* Studio's `/runtime` namespace, where the page's runtime is sent: the first runtime to connect,
   and each event it sends, with the first value the event carries. */
async function studio(): Promise<{ runtime: Promise<Socket>; received: [string, unknown][] }> {
  const http: HttpServer = createServer();
  const io = new Server(http);
  const received: [string, unknown][] = [];
  const runtime = new Promise<Socket>((resolve) => {
    io.of("/runtime").on("connection", (socket) => {
      socket.onAny((event: string, value: unknown) => received.push([event, value]));
      resolve(socket);
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => io.close());
  const { port } = http.address() as AddressInfo;
  Reflect.set(globalThis, STUDIO_URL_KEY, `http://127.0.0.1:${port}`);
  return { runtime, received };
}

/* Asked of the runtime twice in turn, and answered: whatever it sent as the calls before arrived,
   in the same turn or the next, has reached Studio by then. */
async function answeredSince(socket: Socket): Promise<void> {
  for (const _ of [1, 2]) {
    await socket.timeout(5000).emitWithAck("runtime:body", { requestId: "none", part: "response" });
  }
}

describe("the browser build of the runtime on its socket to Studio", () => {
  it("says hello as a browser, and tells Studio what the app's adapters announced", async () => {
    const { runtime, received } = await studio();
    announceHosting({ transports: ["http", "sse"], sources: [], framework: "hono" });
    const handle = await attachRuntime("vite-browser");
    cleanups.push(() => handle.detach());
    const socket = await runtime;

    await answeredSince(socket);

    expect(received).toEqual([
      ["runtime:hello", expect.objectContaining({ runtimeId: "vite-browser", kind: "browser" })],
      ["runtime:announce", { transports: ["http", "sse"], sources: [], framework: "hono" }],
    ]);
  });

  it("answers none of the calls Studio sends only a runtime that showed it the project's token", async () => {
    const { runtime, received } = await studio();
    const handle = await attachRuntime("vite-browser");
    cleanups.push(() => handle.detach());
    const socket = await runtime;
    const delivered: unknown[] = [];

    socket.emit("playground:execute", {
      rid: "r1",
      source: "api",
      group: "",
      method: "list",
      transport: "http",
    });
    socket.emit(
      "webhook:deliver",
      { webhook: "payouts", to: "http://localhost:1/hooks/payouts", body: {} },
      (answer: unknown) => delivered.push(answer),
    );
    await answeredSince(socket);

    expect(received.map(([event]) => event)).toEqual(["runtime:hello"]);
    expect(delivered).toEqual([]);
  });
});
