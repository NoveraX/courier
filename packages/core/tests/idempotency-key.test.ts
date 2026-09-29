/**
 * An endpoint's `idempotencyKey`: the header each call sends a key of its
 * own in, the same on every attempt a retry makes, so an upstream that
 * deduplicates by it applies the write once. The option was typed and
 * documented, and nothing read it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
let upstream: Upstream;
let failFirst: boolean;

beforeEach(async () => {
  failFirst = false;
  upstream = await startUpstream((_request, res) => {
    const failing = failFirst;
    failFirst = false;
    res.writeHead(failing ? 503 : 201, { "content-type": "application/json" });
    res.end("{}");
  });
});

afterEach(async () => {
  await upstream.close();
});

function client() {
  return createCaller(
    defineApi({
      baseURL: upstream.url,
      endpoints: {
        order: endpoint
          .post("orders", { idempotencyKey: "header:Idempotency-Key" })
          .retry({ limit: 2, backoff: "fixed", retryOn: [503], mutations: true })
          .variables<{ item: string }>(),
      },
    }),
  );
}

function keys(): (string | string[] | undefined)[] {
  return upstream.received.map((request) => request.headers["idempotency-key"]);
}

describe("an endpoint with an idempotency key", () => {
  it("sends one key per call, the same on every attempt a retry makes", async () => {
    failFirst = true;

    await client().order({ item: "lamp" });

    expect(upstream.received).toHaveLength(2);
    expect(keys()[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys()[1]).toBe(keys()[0]);
  });

  it("gives each call a key of its own", async () => {
    const orders = client();

    await orders.order({ item: "lamp" });
    await orders.order({ item: "lamp" });

    expect(new Set(keys()).size).toBe(2);
  });

  it("keeps a key the caller sent", async () => {
    await client().order.with({ headers: { "idempotency-key": "order-42" } })({ item: "lamp" });

    expect(keys()).toEqual(["order-42"]);
  });
});

describe("an idempotency key that names no header", () => {
  it("is refused where the endpoint is defined", () => {
    expect(() => endpoint.post("orders", { idempotencyKey: "body:key" })).toThrow(
      expect.objectContaining({ code: "INVALID_IDEMPOTENCY_KEY" }),
    );
  });
});
