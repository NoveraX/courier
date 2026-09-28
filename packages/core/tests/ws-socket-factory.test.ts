/**
 * The socket the WebSocket client drives, from wherever it comes.
 *
 * The client's socket type named the DOM library's events, so a project typed
 * for Node alone failed to compile against it, and a `ws` socket — whose
 * events carry their own `target` — was refused as a `socketFactory`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket as WsSocket } from "ws";

import { courier } from "../src/define/courier";
import type { WSConnection } from "../src/realtime/ws/ws-types";
import { createWSConnection } from "../src/realtime/ws/ws-connection";
import type { WSSocketFactory } from "../src/realtime/ws/ws-types";
import { type ServedWS, serveWS, stopWS } from "./helpers/ws-server";

const { channel } = courier();
let served: ServedWS | undefined;
let connection: WSConnection | undefined;

afterEach(async () => {
  connection?.close();
  connection = undefined;
  await stopWS(served);
  served = undefined;
});

describe("a socket factory", () => {
  it("may hand the client Node's own WebSocket", () => {
    const fromNode: WSSocketFactory = (url, protocols) => new WebSocket(url, protocols);

    expect(fromNode).toBeTypeOf("function");
  });

  it("may hand the client a ws socket, which it then drives", async () => {
    served = await serveWS({
      greeting: channel.response<string>().implement(async function* () {
        yield "hello";
      }),
    });
    const fromWs: WSSocketFactory = (url, protocols) => new WsSocket(url, protocols);
    connection = createWSConnection({ url: served.url, socketFactory: fromWs });

    const received = await new Promise((resolve) => {
      connection?.subscribe("api.live.greeting", resolve);
    });

    expect(received).toBe("hello");
  });
});
