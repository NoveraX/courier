/**
 * `ws` is an optional peer of the standalone server: one that serves no
 * channel runs without it. A WebSocket upgrade to a server installed without
 * it is answered, and the log says what to install.
 */
import { connect } from "node:net";
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ws", () => {
  throw new Error("Cannot find package 'ws'");
});

const { createCourierServer } = await import("../src/create-server");

const { endpoint } = courier();
let stop: (() => Promise<void>) | undefined;

afterEach(async () => {
  await stop?.();
  stop = undefined;
  vi.restoreAllMocks();
});

/* The status line the server answers a WebSocket upgrade with. */
function upgrade(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => {
      socket.write(
        "GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n" +
          "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
      );
    });
    socket.once("data", (data) => {
      resolve(String(data).split("\r\n")[0] ?? "");
      socket.destroy();
    });
    socket.once("error", reject);
  });
}

describe("a server installed without ws", () => {
  it("answers a WebSocket upgrade, and says to install ws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const api = defineApi({
      baseURL: "http://127.0.0.1:1",
      endpoints: { ping: endpoint.get("ping") },
    });
    const server = createCourierServer({
      sources: { api },
      port: 0,
      host: "127.0.0.1",
      signals: false,
    });
    stop = () => server.stop();
    const port = Number(new URL(await server.ready).port);

    const status = await upgrade(port);

    expect(status).toBe("HTTP/1.1 500 Internal Server Error");
    const logged = error.mock.calls.flat().map((part) => String(part));
    expect(logged.some((part) => part.includes("needs the ws package: npm install ws"))).toBe(true);
  });
});
