/**
 * Asking an upstream what a resource allows, with the OPTIONS verb.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { type EchoServer, startEchoServer } from "./helpers/echo-server";

const { endpoint } = courier();

let upstream: EchoServer;

beforeEach(async () => {
  upstream = await startEchoServer();
});

afterEach(async () => {
  await upstream.close();
});

describe("an endpoint addressed with options()", () => {
  const items = defineGroup({
    prefix: "items",
    endpoints: {
      allowed: endpoint.options(":id").variables<{ id: number; detail?: string }>(),
      viaClosure: endpoint
        .variables<{ id: number }>()
        .via((http, v) => http.options(":id", v))
        .reads(),
    },
  });

  function client() {
    return createCaller(defineApi({ baseURL: upstream.origin, groups: { items } }));
  }

  it("is a read", () => {
    expect(items.allowed.kind).toBe("query");
    expect(items.allowed.method).toBe("options");
  });

  it("sends an OPTIONS request with the rest of its variables as the query", async () => {
    await client().items.allowed({ id: 3, detail: "full" });

    expect(upstream.last().method).toBe("OPTIONS");
    expect(upstream.last().url).toBe("/items/3?detail=full");
  });

  it("can be called from an endpoint's closure", async () => {
    await client().items.viaClosure({ id: 4 });

    expect(upstream.last().method).toBe("OPTIONS");
    expect(upstream.last().url).toBe("/items/4");
  });
});
