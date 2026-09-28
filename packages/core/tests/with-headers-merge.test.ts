/**
 * Headers given to `.with()` at more than one level.
 *
 * Each `.with()` replaced the options of the one before, headers included,
 * so a token set on the client was dropped the moment a group added a
 * request id of its own.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { echo, startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream(echo);
});

afterEach(async () => {
  await upstream.close();
});

function client() {
  return createCaller(
    defineApi({
      name: "orders",
      baseURL: upstream.url,
      allowedHeaders: ["x-request-id", "x-trace"],
      groups: {
        orders: defineGroup({ prefix: "orders", endpoints: { list: endpoint.get("") } }),
      },
    }),
  );
}

describe("headers from chained .with() calls", () => {
  it("are all sent, from the client and the group", async () => {
    await client()
      .with({ headers: { authorization: "Bearer token" } })
      .orders.with({ headers: { "x-request-id": "r1" } })
      .list();

    const headers = upstream.received[0]?.headers;
    expect(headers?.authorization).toBe("Bearer token");
    expect(headers?.["x-request-id"]).toBe("r1");
  });

  it("are all sent when chained on one level", async () => {
    await client()
      .with({ headers: { authorization: "Bearer token" } })
      .with({ headers: { "x-trace": "t1" } })
      .orders.list();

    const headers = upstream.received[0]?.headers;
    expect(headers?.authorization).toBe("Bearer token");
    expect(headers?.["x-trace"]).toBe("t1");
  });

  it("let the later value win for the same header", async () => {
    await client()
      .with({ headers: { authorization: "Bearer first" } })
      .orders.with({ headers: { Authorization: "Bearer second" } })
      .list();

    expect(upstream.received[0]?.headers.authorization).toBe("Bearer second");
  });
});
