/**
 * `.writes()` declares an endpoint a write whatever verb addresses it — a GET
 * that changes something, an unsubscribe link or a token it spends, which a
 * read's retries, cache and shared requests would repeat. The type and the
 * runtime read it alike, the routes carry it to a page, and what a read
 * alone takes is refused with the reason.
 */
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import type { InferKind } from "../src/define/marker";
import { routesOf } from "../src/define/routes-of";
import { retryMiddleware } from "../src/middleware/index";
import { sendJson, startUpstream, type Upstream } from "./helpers/middleware-upstream";

const { endpoint } = courier();

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
});

describe(".writes()", () => {
  const unsubscribe = endpoint.get("unsubscribe").variables<{ token: string }>().writes();

  it("makes a GET a write, in its type and as it runs", () => {
    expect(unsubscribe.kind).toBe("mutation");
    expectTypeOf<InferKind<typeof unsubscribe>>().toEqualTypeOf<"mutation">();
    expect(unsubscribe.method).toBe("get");
  });

  it("routes it to a page as a write", () => {
    const api = defineApi({
      name: "api",
      baseURL: "https://api.example.com",
      expose: true,
      groups: { mail: defineGroup({ endpoints: { unsubscribe } }) },
    });

    expect(routesOf(api, "api").endpoints["mail.unsubscribe"]).toEqual({ type: "mutation" });
  });

  it("sends it once, as a write is sent, with the verb it was addressed with", async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 503, { message: "busy" }));
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: upstream.url,
        middleware: [retryMiddleware({ limit: 2, delay: 1 })],
        endpoints: { unsubscribe },
      }),
    );

    await expect(client.unsubscribe({ token: "t" })).rejects.toThrow(/HTTP 503/);

    expect(upstream.seen.map((seen) => seen.method)).toEqual(["GET"]);
  });

  it("refuses what a read alone takes, saying the endpoint was declared a write", () => {
    // @ts-expect-error a write's answer is never kept
    expect(() => unsubscribe.cache({})).toThrow(/declared a write with \.writes\(\)/);
    // @ts-expect-error a newer call never cancels a write
    expect(() => unsubscribe.cancelPrevious()).toThrow(/declared a write with \.writes\(\)/);
  });
});
