/**
 * Playground requests over real sockets, through a running Studio.
 *
 * Several processes may attach under one runtime id — the defaults
 * "server" and "browser" are shared by every app that names none — and the
 * newest of them serves the playground. When that one goes away
 * mid-request while an older one stays, its requests are ended at once —
 * not a stream spinning for good, or an HTTP request failing only after its
 * 30 s timeout.
 *
 * A rid is chosen by the UI, so a second UI sending a rid already in flight
 * does not take the first one's stream over and leave it without an end.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";

let root: string;
let studio: StudioServer | undefined;
let url: string;
const sockets: Socket[] = [];

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-playground-sockets-")));
  writeFileSync(
    join(root, "courier.config.ts"),
    'export default { sources: { api: { baseURL: "https://api.example" } } };\n',
  );
  url = await new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}, 30_000);

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

async function open(namespace: "/ui" | "/runtime"): Promise<Socket> {
  const socket = connect(`${url}${namespace}`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    auth: { token: studio?.token },
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return socket;
}

/* A runtime serving `api` over HTTP and SSE, which hands every request it is sent to `onExecute`. */
async function runtime(
  id: string,
  onExecute: (payload: { rid: string }) => void = () => {},
): Promise<Socket> {
  const socket = await open("/runtime");
  socket.on("playground:execute", onExecute);
  socket.emit("runtime:hello", { runtimeId: id, kind: "server" });
  socket.emit("runtime:announce", { transports: ["http", "sse"], sources: ["api"] });
  return socket;
}

function next<TPayload>(
  socket: Socket,
  event: string,
  rid: string,
  ms = 3_000,
): Promise<TPayload | "timeout"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), ms);
    const listener = (payload: TPayload & { rid?: unknown }) => {
      if (payload.rid !== rid) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });
}

function exec(ui: Socket, rid: string, transport: "http" | "sse"): void {
  ui.emit("playground:exec", { rid, source: "api", group: "users", method: "list", transport });
}

/* Let Studio take in what the sockets sent before the test goes on. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

describe("two runtimes under one id", () => {
  it("names the second to claim it", async () => {
    const ui = await open("/ui");
    const duplicate = new Promise<unknown>((resolve) => ui.once("runtime:duplicate", resolve));
    await runtime("server");
    await settle();
    await runtime("server");

    expect(await duplicate).toEqual({ runtimeId: "server" });
  });
});

describe("the first of two runtimes under one id disconnecting mid-request", () => {
  it.each(["sse", "http"] as const)(
    "ends its %s request with an error at once",
    async (transport) => {
      const executed: string[] = [];
      const first = await runtime("server", ({ rid }) => executed.push(rid));
      await runtime("server");
      const ui = await open("/ui");
      await settle();
      exec(ui, "r1", transport);
      await vi.waitFor(() => expect(executed).toEqual(["r1"]));
      const error = next<{ error: { message: string } }>(ui, "playground:error", "r1");

      first.close();

      expect(await error).toMatchObject({ error: { message: "Runtime disconnected mid-request" } });
    },
  );

  it("sends the next request to the runtime still running", async () => {
    const executed: string[] = [];
    const first = await runtime("server");
    await runtime("server", ({ rid }) => executed.push(rid));
    const ui = await open("/ui");
    await settle();

    first.close();
    await settle();
    exec(ui, "r2", "http");

    await vi.waitFor(() => expect(executed).toEqual(["r2"]));
  });
});

describe("a rid already in flight", () => {
  it("is refused to another UI, and the stream it names goes on", async () => {
    const executed: string[] = [];
    const app = await runtime("app", ({ rid }) => executed.push(rid));
    const first = await open("/ui");
    const second = await open("/ui");
    await settle();
    exec(first, "same", "sse");
    await vi.waitFor(() => expect(executed).toEqual(["same"]));

    const refused = next<{ error: { message: string } }>(second, "playground:error", "same");
    exec(second, "same", "http");
    expect(await refused).toMatchObject({ error: { message: expect.stringContaining("already") } });

    const chunk = next(first, "playground:chunk", "same");
    const stolen = next(second, "playground:chunk", "same", 300);
    app.emit("playground:chunk", {
      rid: "same",
      chunk: { kind: "sse-event", event: { data: "tick" } },
    });
    expect(await chunk).toMatchObject({ rid: "same" });
    expect(await stolen).toBe("timeout");
    expect(executed).toEqual(["same"]);
  });
});
