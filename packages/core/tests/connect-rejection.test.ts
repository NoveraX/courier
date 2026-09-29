/**
 * What a client reads, and the server keeps, when `onConnect` or
 * `onSSEConnect` throws — end to end on real servers.
 *
 * The thrown error stays on the server, where it is logged: it may carry a
 * connection string or a token, so the client reads a fixed reason instead.
 * `onSSEConnect`'s error used to be dropped without a trace.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier } from "../src/define/courier";
import { sendWebResponse, toWebRequest } from "../src/node";
import { AuthError, ForbiddenError, type RealtimeError } from "../src/realtime/errors";
import { subscribeSSE } from "../src/realtime/sse/sse-client";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

const { stream, channel } = courier();
const SECRET = "postgres://app:hunter2@10.0.0.5/app";

let served: ServedWS | undefined;
let server: Server | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await stopWS(served);
  served = undefined;
  _resetSourcesForTests();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

/** Every argument the server's log was handed, as text. */
function logged(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.flat().map(String).join("\n");
}

describe("an onConnect that throws", () => {
  it("closes the socket with 4401, which the client reads as an AuthError and does not retry", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onConnect = vi.fn(() => {
      throw new Error(`could not reach ${SECRET}`);
    });
    served = await serveWS(
      {
        room: channel
          .send<string>()
          .response<string>()
          .implement(() => ({ onMessage() {} })),
      },
      { onConnect },
    );
    const ch = executeWSChannel<string, string>(served.url, "api.live.room");
    const errors: RealtimeError[] = [];
    ch.on("error", (error) => errors.push(error));
    await settle(1_500);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(AuthError);
    expect(errors[0]).toMatchObject({ code: 4401, message: "Connection rejected" });
    expect(ch.status).toBe("disconnected");
    expect(onConnect).toHaveBeenCalledOnce();
    expect(logged(warn)).toContain(SECRET);
  });
});

describe("a channel whose connection is refused", () => {
  it("hears why before it reports itself disconnected, as a channel's end comes", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    served = await serveWS(
      {
        room: channel
          .send<string>()
          .response<string>()
          .implement(() => ({ onMessage() {} })),
      },
      {
        onConnect: () => {
          throw new Error("not today");
        },
      },
    );
    const ch = executeWSChannel<string, string>(served.url, "api.live.room");
    const heard: string[] = [];
    ch.on("error", (error) => heard.push(`error ${error.code}`));
    ch.on("status", (status) => heard.push(status));
    await settle(1_500);

    expect(heard.slice(-2)).toEqual(["error 4401", "disconnected"]);
  });
});

describe("an onSSEConnect that throws", () => {
  it("answers 403, which the client reads as a ForbiddenError, and logs why", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const feed = stream.response<number>().implement(async function* () {
      yield { data: 1 };
    });
    registerSources({ api: { options: { groups: {} }, feed } } as never);
    const handler = createHandler({
      onSSEConnect: () => {
        throw new Error(`could not reach ${SECRET}`);
      },
    });
    server = createServer(async (request, response) => {
      await sendWebResponse(await handler.handleSSE(toWebRequest(request, response)), response);
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sse?_s=api&_m=feed`;

    const failure = await (async () => {
      for await (const _event of subscribeSSE(url)) return undefined;
      return undefined;
    })().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ForbiddenError);
    expect(failure).toMatchObject({ code: 4403, message: "Connection rejected" });
    expect(logged(warn)).toContain(SECRET);
  });
});
