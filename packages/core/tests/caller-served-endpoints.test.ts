/**
 * A direct caller on streams and channels this process serves.
 *
 * `createCaller(api)` runs an endpoint defined with `.implement()` in this
 * process, rather than dialling the API's `baseURL` — the upstream's address,
 * where nothing serves it — and reconnecting there for good with no error, a
 * stream's loop never started and a channel left "reconnecting".
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { ConfigurationError } from "../src/errors/configuration-error";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";

const { endpoint, stream, channel } = courier();

let upstream: Server | undefined;
const requests: string[] = [];

afterEach(async () => {
  clearWSConnectionPool();
  requests.length = 0;
  upstream?.closeAllConnections();
  await new Promise<void>((resolve) => upstream?.close(() => resolve()) ?? resolve());
  upstream = undefined;
});

/** An upstream that answers every request with `{ ok: true }` and counts them. */
async function listen(): Promise<string> {
  upstream = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true }));
  });
  upstream.on("upgrade", (request, socket) => {
    requests.push(`UPGRADE ${request.url}`);
    socket.destroy();
  });
  await new Promise<void>((resolve) => upstream?.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
}

function apiAt(baseURL: string) {
  return defineApi({
    name: "api",
    baseURL,
    groups: {
      live: defineGroup({
        prefix: "live",
        endpoints: {
          ticks: stream.response<number>().implement(async function* () {
            yield { data: 1 };
          }),
          room: channel
            .send<string>()
            .response<string>()
            .implement(() => ({ onMessage: () => undefined })),
          feed: channel.response<number>().implement(async function* () {
            yield 1;
          }),
          health: endpoint.get("health").response<{ ok: boolean }>(),
        },
      }),
    },
  });
}

async function refusal(open: () => unknown): Promise<unknown> {
  try {
    open();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("a direct caller on an endpoint this process serves", () => {
  it.each([
    ["a stream", "ticks"],
    ["a channel", "room"],
    ["a push channel", "feed"],
  ] as const)(
    "refuses %s with a ConfigurationError naming it, and dials nothing",
    async (_, name) => {
      const client = createCaller(apiAt(await listen()));

      const error = await refusal(() => client.live[name]());
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error).toMatchObject({ code: "DIRECT_CALL_TO_SERVED_ENDPOINT" });
      expect((error as Error).message).toContain(`api.live.${name}`);
      expect((error as Error).message).toContain("createProxyCaller");
      expect(requests).toEqual([]);
    },
  );

  it("still reaches the rest of the API", async () => {
    const client = createCaller(apiAt(await listen()));

    await expect(client.live.health()).resolves.toEqual({ ok: true });
    expect(requests).toEqual(["GET /live/health"]);
  });
});
