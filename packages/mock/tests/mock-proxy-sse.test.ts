/**
 * A proxy client's stream against the mock server.
 *
 * A proxy-mode subscription opens `GET /api/sse?_s=…&_g=…&_m=…&_v=…`, the
 * route a Courier proxy serves streams on, and the mock server serves it
 * too, so a proxy client streams from a mock rather than meeting a 404.
 */
import { createProxyCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { routesOf } from "@noverax/courier/internal";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createMockServer } from "../src/server/create-mock-server";

const { endpoint, stream } = courier();
const api = defineApi({
  expose: true,
  baseURL: "http://placeholder.invalid",
  groups: {
    live: defineGroup({
      prefix: "live",
      endpoints: {
        ticker: stream
          .variables<{ from: number }>()
          .response(z.object({ n: z.number() }))
          .get("stream"),
        status: endpoint.get("status").response<{ ok: boolean }>(),
      },
    }),
  },
});

const server = createMockServer({ port: 0, log: false });
let base: string;

beforeAll(async () => {
  server.mock("live", "ticker").stream(async function* (ctx) {
    const { from } = ctx.variables as { from: number };
    yield { data: { n: from } };
    yield { data: { n: from + 1 } };
  });
  server.mock("live", "status").resolves({ ok: true });
  base = (await server.start()).url;
});

afterAll(async () => {
  await server.stop();
});

function proxyClient() {
  return createProxyCaller(routesOf(api, "api"), {
    proxyPath: { http: `${base}/api/request`, sse: `${base}/api/sse` },
  });
}

describe("proxy-mode SSE on the mock server", () => {
  it("streams a mocked stream, with the call's variables", async () => {
    const received: number[] = [];
    for await (const event of proxyClient().live.ticker({ from: 7 })) received.push(event.data.n);

    expect(received).toEqual([7, 8]);
  });

  it("refuses variables that are not a JSON object", async () => {
    const res = await fetch(`${base}/api/sse?_s=api&_g=live&_m=ticker&_v=%5B1%5D`);
    expect(res.status).toBe(400);
  });

  it("refuses to stream an endpoint mocked with a plain answer", async () => {
    const res = await fetch(`${base}/api/sse?_s=api&_g=live&_m=status`);
    expect(res.status).toBe(404);
  });
});
