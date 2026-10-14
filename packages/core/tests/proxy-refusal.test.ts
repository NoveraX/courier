/**
 * A stand-in for the proxy — the mock server — refuses a call as the proxy
 * does: the same calls, with the same status and message, so a page that
 * works against the stand-in is not refused by the proxy. Each case is
 * asked of the proxy itself, and of `proxyRefusal`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveSSEEndpoint } from "../src/adapter/sse-resolve";
import { courier, defineApi, defineGroup } from "../src/define/index";
import type { Context } from "../src/http-client/types";
import { executeRequest } from "../src/utils/execute";
import { proxyRefusal } from "../src/utils/proxy-refusal";

const { endpoint, stream } = courier();

const api = defineApi({
  baseURL: "https://api.example.com",
  expose: true,
  groups: {
    shop: defineGroup({
      prefix: "shop",
      endpoints: {
        list: endpoint.get("items"),
        lookup: endpoint.get("lookup", { sensitiveVariables: true }).variables<{ email: string }>(),
        buy: endpoint.post("buy"),
        audit: endpoint.get("audit").expose(false),
        feed: stream.get("feed"),
        hidden: stream.get("hidden").expose(false),
      },
    }),
  },
  endpoints: { health: endpoint.get("health") },
});

/* What the proxy itself answers a call from a page with. */
async function proxyAnswer(group: string, method: string, proxyMethod: "GET" | "POST") {
  const response = (await executeRequest(
    { api } as never,
    { source: "api", group, method } as never,
    {
      res: new Response(),
      proxyMethod,
      req: new Request("https://app.example.com/api/request", { method: proxyMethod }),
    } as Context & { res: Response },
  )) as Response;
  const body: unknown = await response.json();
  return { status: response.status, message: Reflect.get(Object(body), "message") as unknown };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ok: true })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("proxyRefusal", () => {
  it.each([
    ["shop", "audit", "POST"],
    ["shop", "audit", "GET"],
    ["shop", "buy", "GET"],
    ["shop", "lookup", "GET"],
  ] as const)("refuses %s.%s by %s as the proxy does", async (group, method, via) => {
    const refused = proxyRefusal(api, { source: "api", group, method, via });

    expect(refused).toBeDefined();
    expect(await proxyAnswer(group, method, via)).toEqual(refused);
  });

  it.each([
    ["shop", "list", "GET"],
    ["shop", "list", "POST"],
    ["shop", "lookup", "POST"],
    ["shop", "buy", "POST"],
    ["", "health", "GET"],
  ] as const)("lets %s.%s by %s run, as the proxy does", async (group, method, via) => {
    expect(proxyRefusal(api, { source: "api", group, method, via })).toBeUndefined();
    expect((await proxyAnswer(group, method, via)).status).toBe(200);
  });

  it("leaves a name the source does not define to the stand-in", () => {
    expect(
      proxyRefusal(api, { source: "api", group: "shop", method: "nope", via: "POST" }),
    ).toBeUndefined();
  });

  it("refuses a stream the source keeps from a page as the proxy's stream route does, and opens one it serves", async () => {
    const refused = proxyRefusal(api, {
      source: "api",
      group: "shop",
      method: "hidden",
      via: "sse",
    });
    const answer = resolveSSEEndpoint({ api } as never, "api", "shop", "hidden");
    if (!(answer instanceof Response)) {
      throw new Error("the proxy opened a stream it keeps from a page");
    }
    const body: unknown = await answer.json();

    expect(refused).toEqual({
      status: answer.status,
      message: Reflect.get(Object(body), "message"),
    });
    expect(
      proxyRefusal(api, { source: "api", group: "shop", method: "feed", via: "sse" }),
    ).toBeUndefined();
  });
});
