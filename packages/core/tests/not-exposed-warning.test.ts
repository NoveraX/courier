/**
 * A page that calls an endpoint nothing marks for it is answered as for a
 * name the source does not define, in development as in production; only
 * the server's own log says why, while developing, once for each endpoint.
 * A WebSocket or SSE handler says it in its own words: no proxy, no routes,
 * for a channel or stream it serves itself.
 */
import { format } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createWSHandler } from "../src/adapter/handle-ws";
import { courier, defineApi } from "../src/define/index";
import type { Sources } from "../src/define/types";
import type { Context } from "../src/http-client/types";
import { qualifyTopic } from "../src/realtime/ws/topic-key";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { executeRequest } from "../src/utils/execute";
import { authFrame, createFakeSocket } from "./helpers/fake-socket";

const { endpoint, channel, stream } = courier();

const api = defineApi({
  baseURL: "https://api.example.com",
  endpoints: { health: endpoint.get("health").expose(), audit: endpoint.get("audit") },
});

async function fromPage(method: string) {
  const response = (await executeRequest(
    { api } as never,
    { source: "api", method } as never,
    {
      res: new Response(),
      proxyMethod: "POST",
      req: new Request("https://app.example.com/api/request", { method: "POST" }),
    } as Context & { res: Response },
  )) as Response;
  return { status: response.status, body: await response.text() };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ok: true })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  _resetSourcesForTests();
});

/** What the server warned of, each call as the console prints it. */
function warnings(): string {
  return warn.mock.calls.map((call: unknown[]) => format(...call)).join("\n");
}

describe("a page's call to an endpoint nothing marks", () => {
  it("is answered as an unknown name is, and the log names the fix while developing", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const refused = await fromPage("audit");
    const unknown = await fromPage("nothing");
    await fromPage("audit");

    expect(refused).toEqual({ status: 400, body: unknown.body.replace("[nothing]", "[audit]") });
    const said = warn.mock.calls.flat().map(String).join("\n");
    expect(
      said.match(/\[api\]\[audit\]: a page called it, and nothing marks it \.expose\(\)/g),
    ).toHaveLength(1);
    expect(said).toContain(
      "Mark it where it is defined if a page may call it, and write the routes again.",
    );
  });

  it("says nothing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    expect((await fromPage("audit")).status).toBe(400);
    expect(warn.mock.calls.flat().map(String).join("\n")).not.toContain("nothing marks it");
  });

  it("is run where the endpoint is marked", async () => {
    expect((await fromPage("health")).status).toBe(200);
  });
});

describe("a client's subscription to a channel nothing marks", () => {
  it("is refused as an unknown channel, and the log names the fix without a proxy or routes", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NO_COLOR", "1");
    const room = channel
      .send<string>()
      .response<string>()
      .implement(() => ({ onMessage: () => undefined }));
    registerSources({ api: { options: { groups: { live: { options: {}, room } } } } } as Sources);
    const handler = createWSHandler({ heartbeatIntervalMs: 60_000 });
    const socket = createFakeSocket();
    handler.handleSocket(socket, new Request("http://localhost/api/ws"), "203.0.113.7");
    socket.receive(authFrame());

    for (const id of ["s1", "s2"]) {
      socket.receive({ type: "subscribe", id, topic: qualifyTopic("api.live.room", {}) });
    }

    await expect.poll(() => socket.sent.filter((msg) => msg.type === "complete")).toHaveLength(2);
    expect(socket.sent.find((msg) => msg.type === "complete")?.error?.code).toBe(4403);
    const said = warnings();
    expect(said.match(/courier:ws\s+\[api\]\[live\]\[room\]: a client subscribed/g)).toHaveLength(
      1,
    );
    expect(said).toContain(
      "[api][live][room]: a client subscribed to it over WebSocket, and nothing marks it .expose() — on the channel, its group or the API — so the handler refused it as an unknown channel. Mark it where it is defined if clients may subscribe to it.",
    );
    expect(said).not.toMatch(/proxy|routes/i);
    await handler.destroy();
  });
});

describe("a client's stream nothing marks", () => {
  it("is answered as an unknown stream, and the log names the fix without a proxy or routes", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NO_COLOR", "1");
    const feed = stream.response<unknown>().implement(async function* () {
      yield { data: "x" };
    });
    registerSources({ api: { options: { groups: {} }, feed } } as Sources);
    const { handleSSE } = createHandler();

    const response = await handleSSE(
      new Request("http://localhost/api/sse?_s=api&_m=feed", {
        headers: { accept: "text/event-stream" },
      }),
    );

    expect(response.status).toBe(400);
    const said = warnings();
    expect(said).toMatch(/courier:sse\s+\[api\]\[\]\[feed\]: a client opened it over SSE/);
    expect(said).toContain(
      "[api][][feed]: a client opened it over SSE, and nothing marks it .expose() — on the stream, its group or the API — so the handler refused it as an unknown stream. Mark it where it is defined if clients may open it.",
    );
    expect(said).not.toMatch(/proxy|routes/i);
  });
});
