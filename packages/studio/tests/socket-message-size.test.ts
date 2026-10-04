/**
 * Studio's sockets carry what an app really sends: a response of a few
 * megabytes, variables of a few megabytes typed into the playground. Held to
 * Socket.IO's default of 1 MB, any larger message would close the
 * connection that sent it, without a word in either log: the runtime's
 * request would never complete in the Timeline, and the UI would lose its
 * socket.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import { MAX_MESSAGE_BYTES } from "../src/server/max-message-bytes";
import type { StudioServer } from "../src/server/types";

const MB = 1024 * 1024;

let root: string;
let studio: StudioServer | undefined;
let url: string;
const sockets: Socket[] = [];

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-socket-size-")));
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

async function open(
  namespace: "/ui" | "/runtime",
  transport: "websocket" | "polling",
): Promise<Socket> {
  const socket = connect(`${url}${namespace}`, {
    transports: [transport],
    forceNew: true,
    reconnection: false,
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return socket;
}

function disconnection(socket: Socket): Promise<string> {
  return new Promise((resolve) => socket.once("disconnect", resolve));
}

function within<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([
    promise,
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms)),
  ]);
}

describe.each(["websocket", "polling"] as const)(
  "a message of a few megabytes over %s",
  (transport) => {
    it("reaches the UI from a runtime, which stays connected", async () => {
      const ui = await open("/ui", transport);
      const runtime = await open("/runtime", transport);
      runtime.emit("runtime:hello", { runtimeId: "big-app", kind: "server" });
      const body = "x".repeat(3 * MB);
      const received = new Promise<unknown>((resolve) => {
        ui.on("event", (event: { type?: unknown; id?: unknown; body?: unknown }) => {
          if (event.type === "request:end" && event.id === "r1") {
            resolve(typeof event.body === "string" ? event.body.length : event.body);
          }
        });
      });
      const dropped = disconnection(runtime);

      runtime.emit("event", { type: "request:end", id: "r1", body });

      expect(await within(received, 5_000)).toBe(body.length);
      expect(await within(dropped, 300)).toBe("timeout");
      expect(runtime.connected).toBe(true);
    }, 15_000);

    it("keeps the UI connected when it sends one", async () => {
      const ui = await open("/ui", transport);
      const dropped = disconnection(ui);
      const answered = new Promise<unknown>((resolve) => ui.on("playground:error", resolve));

      ui.emit("playground:exec", {
        rid: "big-vars",
        source: "api",
        group: "users",
        method: "create",
        transport: "http",
        variables: { note: "y".repeat(2 * MB) },
      });

      expect(await within(answered, 5_000)).toMatchObject({ rid: "big-vars" });
      expect(await within(dropped, 300)).toBe("timeout");
    }, 15_000);
  },
);

describe("a message over the limit", () => {
  it("is logged with the reason the connection broke", async () => {
    const warn = vi.mocked(console.warn);
    const runtime = await open("/runtime", "websocket");
    const dropped = disconnection(runtime);

    runtime.emit("event", { type: "request:end", id: "huge", body: "z".repeat(MAX_MESSAGE_BYTES) });

    expect(await within(dropped, 10_000)).not.toBe("timeout");
    await vi.waitFor(() => {
      const logged = warn.mock.calls.map((call) => call.map(String).join(" ")).join("\n");
      expect(logged).toContain("A runtime lost its connection to Studio");
      expect(logged).toContain("Max payload size exceeded");
    });
  }, 30_000);
});
