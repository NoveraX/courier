/**
 * The middleware an endpoint's call runs through, read from the definitions
 * before any call, as Studio shows it: the API's own, then the endpoint's
 * `.retry()`, then what its base and its own `.use()` add — its own alone
 * with `inherit: false` — each named as a call's events name it. Drawn at
 * random, every arrangement reads as the chain a real call runs through.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { defineMiddleware } from "../src/middleware/index";
import type { Middleware } from "../src/middleware/types";
import { studioHooks } from "../src/studio";
import type { StudioHooks } from "../src/studio/hooks";
import { middlewareChainOf } from "../src/utils/middleware-chain-of";
import { sendJson, startUpstream, type Upstream } from "./helpers/middleware-upstream";
import { seededIntegers } from "./helpers/seeded-random";

const named = (name: string): Middleware => defineMiddleware(name, "before", () => {});

describe("the middleware an endpoint runs through, read before any call", () => {
  it("names the API's, the retry, the base's and the endpoint's own, in that order", () => {
    const { endpoint } = courier({ middleware: [named("tenant")] });
    const api = defineApi({
      baseURL: "https://api.example",
      middleware: [named("audit")],
      groups: {
        orders: defineGroup({
          prefix: "orders",
          endpoints: {
            list: endpoint.get("").response<unknown[]>(),
            place: endpoint.use(named("sign")).retry({ limit: 2 }).post("").response<unknown>(),
            ping: endpoint.get("ping", { inherit: false }).response<unknown>(),
          },
        }),
      },
    });

    expect(middlewareChainOf(api, "orders", "list")).toEqual([
      { name: "audit", layer: "api" },
      { name: "tenant", layer: "endpoint" },
    ]);
    expect(middlewareChainOf(api, "orders", "place")).toEqual([
      { name: "audit", layer: "api" },
      { name: "retry", layer: "retry" },
      { name: "tenant", layer: "endpoint" },
      { name: "sign", layer: "endpoint" },
    ]);
    expect(middlewareChainOf(api, "orders", "ping")).toEqual([{ name: "audit", layer: "api" }]);
  });

  it("finds an endpoint in a group inside a group, and none the API does not hold", () => {
    const { endpoint } = courier();
    const api = defineApi({
      baseURL: "https://api.example",
      middleware: [named("audit")],
      groups: {
        billing: defineGroup({
          prefix: "billing",
          groups: {
            invoices: defineGroup({
              prefix: "invoices",
              endpoints: { list: endpoint.use(named("cache")).get("").response<unknown[]>() },
            }),
          },
        }),
      },
    });

    expect(middlewareChainOf(api, "billing.invoices", "list").map((step) => step.name)).toEqual([
      "audit",
      "cache",
    ]);
    expect(middlewareChainOf(api, "billing", "list")).toEqual([]);
    expect(middlewareChainOf(api, "billing.invoices", "missing")).toEqual([]);
  });
});

describe("the chain read before any call, against a call's own", () => {
  let upstream: Upstream;
  let saved: StudioHooks;
  const entered: string[] = [];

  beforeEach(async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 200, { ok: true }));
    saved = { ...studioHooks };
    studioHooks.onRequestStart = () => {};
    studioHooks.onMiddlewareEnter = (event) => void entered.push(event.name);
  });

  afterEach(async () => {
    for (const key of Object.keys(studioHooks) as Array<keyof StudioHooks>) delete studioHooks[key];
    Object.assign(studioHooks, saved);
    entered.length = 0;
    await upstream.close();
  });

  it("is the chain each call runs through, for 60 arrangements drawn at random", async () => {
    const next = seededIntegers(0x6d1d);
    for (let draw = 0; draw < 60; draw++) {
      const many = (prefix: string) =>
        Array.from({ length: next(3) }, (_, at) => named(`${prefix}-${draw}-${at}`));
      const inherit = next(2) === 0;
      const retry = next(2) === 0;
      const grouped = next(3);
      const baseMiddleware = many("base");
      const apiMiddleware = many("api");
      const { endpoint } = courier({ middleware: baseMiddleware });
      const ownMiddleware = many("own");
      const own = ownMiddleware.length > 0 ? endpoint.use(...ownMiddleware) : endpoint;
      const built = (retry ? own.retry({ limit: 1 }) : own).get("ping", { inherit });
      const leaf = { ping: built.response<unknown>() };
      const base = { name: "api", baseURL: upstream.url, middleware: apiMiddleware };
      const inner = defineGroup({ prefix: "inner", endpoints: leaf });
      const api =
        grouped === 0
          ? defineApi({ ...base, endpoints: leaf })
          : grouped === 1
            ? defineApi({
                ...base,
                groups: { outer: defineGroup({ prefix: "outer", endpoints: leaf }) },
              })
            : defineApi({
                ...base,
                groups: { outer: defineGroup({ prefix: "outer", groups: { inner } }) },
              });
      const path = grouped === 0 ? "" : grouped === 1 ? "outer" : "outer.inner";
      const client: unknown = createCaller(api);
      const owner = path === "" ? client : path.split(".").reduce(memberOf, client);
      const ping = memberOf(owner, "ping");
      if (typeof ping !== "function") throw new Error(`draw ${draw}: no ping at ${path}`);
      entered.length = 0;

      await Reflect.apply(ping, owner, []);

      const chain = middlewareChainOf(api, path, "ping");
      expect(
        chain.map((step) => step.name),
        `draw ${draw}`,
      ).toEqual(entered);
      expect(
        chain.map((step) => step.layer),
        `draw ${draw}`,
      ).toEqual([
        ...apiMiddleware.map(() => "api"),
        ...(retry ? ["retry"] : []),
        ...(inherit ? baseMiddleware : []).map(() => "endpoint"),
        ...ownMiddleware.map(() => "endpoint"),
      ]);
    }
  });
});

function memberOf(owner: unknown, key: string): unknown {
  return (typeof owner === "object" || typeof owner === "function") && owner !== null
    ? Reflect.get(owner, key)
    : undefined;
}
