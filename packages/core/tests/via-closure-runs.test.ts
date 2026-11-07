/**
 * When a `.via()` closure runs: once as the endpoint is defined, against a
 * recorder that learns its method and path from stand-in variables, and
 * again on every call and every attempt a retry makes, with the call's own
 * variables and an HTTP client that sends the request. A stream's closure
 * runs each time a subscription is addressed. What the docs say of it has
 * to match.
 */
import { afterEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { retryMiddleware } from "../src/middleware/index";
import { streamRequest } from "../src/transport/direct/stream-request";
import { sendJson, startUpstream, type Upstream } from "./helpers/middleware-upstream";

const { endpoint, stream } = courier();

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
});

describe("a .via() closure", () => {
  it("runs as it is defined, then on every call and every retried attempt", async () => {
    upstream = await startUpstream((_req, res, index) =>
      sendJson(res, index === 1 ? 503 : 200, { n: index }),
    );
    const seen: unknown[] = [];
    const rename = endpoint.variables<{ id: number; name: string }>().via((http, variables) => {
      seen.push(variables);
      return http.post(":id/rename", { name: variables.name });
    });
    expect(seen).toHaveLength(1);

    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: upstream.url,
        middleware: [retryMiddleware({ limit: 1, delay: 1, mutations: true })],
        endpoints: { rename },
      }),
    );
    await client.rename({ id: 1, name: "a" });
    await client.rename({ id: 2, name: "b" });

    expect(seen.slice(1)).toEqual([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 2, name: "b" },
    ]);
  });

  it("of a stream runs as it is defined, then for each subscription it addresses", () => {
    const seen: unknown[] = [];
    const events = stream.variables<{ room: string }>().via((sse, variables) => {
      seen.push(variables);
      return sse.get(sse.path`rooms/${variables.room}/events`);
    });
    const api = defineApi({
      name: "api",
      baseURL: "https://api.example.com",
      endpoints: { events },
    });
    expect(seen).toHaveLength(1);

    const lobby = streamRequest(api, api.options, "", "events", { room: "lobby" });
    const garden = streamRequest(api, api.options, "", "events", { room: "garden" });

    expect(seen.slice(1)).toEqual([{ room: "lobby" }, { room: "garden" }]);
    expect([lobby.url, garden.url]).toEqual([
      "https://api.example.com/rooms/lobby/events",
      "https://api.example.com/rooms/garden/events",
    ]);
  });
});
