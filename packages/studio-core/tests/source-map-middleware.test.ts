/**
 * The middleware each endpoint runs through, as Studio reads it from the
 * definitions before any call: the source's, then the endpoint's retry,
 * then what the endpoint's base and its own `.use()` add — and only its own
 * when it does not inherit — each with where it is declared.
 */
import { defineMiddleware } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { extractSourceMap } from "../src/source-map";

const audit = defineMiddleware("audit", "before", () => {});
const tenant = defineMiddleware("tenant", "before", () => {});
const sign = defineMiddleware("sign", "before", () => {});

describe("the middleware an endpoint runs through, before any call", () => {
  it("names the base's and the endpoint's own after the source's", () => {
    const { endpoint } = courier({ middleware: [tenant] });
    const api = defineApi({
      baseURL: "https://api.example",
      middleware: [audit],
      groups: {
        orders: defineGroup({
          prefix: "orders",
          endpoints: {
            list: endpoint.get("").response<unknown[]>(),
            place: endpoint.use(sign).retry({ limit: 2 }).post("").response<unknown>(),
            ping: endpoint.get("ping", { inherit: false }).response<unknown>(),
          },
        }),
      },
    });

    const endpoints = extractSourceMap({ api }).api?.groups.orders?.endpoints;

    expect(endpoints?.list?.middleware).toEqual([
      { name: "audit", layer: "api" },
      { name: "tenant", layer: "endpoint" },
    ]);
    expect(endpoints?.place?.middleware).toEqual([
      { name: "audit", layer: "api" },
      { name: "retry", layer: "retry" },
      { name: "tenant", layer: "endpoint" },
      { name: "sign", layer: "endpoint" },
    ]);
    expect(endpoints?.ping?.middleware).toEqual([{ name: "audit", layer: "api" }]);
  });

  it("reads an endpoint of the source's own and one in a group inside a group", () => {
    const { endpoint } = courier();
    const api = defineApi({
      baseURL: "https://api.example",
      endpoints: { health: endpoint.use(sign).get("health").response<unknown>() },
      groups: {
        billing: defineGroup({
          prefix: "billing",
          groups: {
            invoices: defineGroup({
              prefix: "invoices",
              endpoints: { list: endpoint.use(tenant).get("").response<unknown[]>() },
            }),
          },
        }),
      },
    });

    const groups = extractSourceMap({ api }).api?.groups;

    expect(groups?.[""]?.endpoints.health?.middleware).toEqual([
      { name: "sign", layer: "endpoint" },
    ]);
    expect(groups?.["billing.invoices"]?.endpoints.list?.middleware).toEqual([
      { name: "tenant", layer: "endpoint" },
    ]);
  });

  it("leaves the field out of an endpoint that runs through none", () => {
    const { endpoint } = courier();
    const api = defineApi({
      baseURL: "https://api.example",
      endpoints: { health: endpoint.get("health").response<unknown>() },
    });

    expect(extractSourceMap({ api }).api?.groups[""]?.endpoints.health).not.toHaveProperty(
      "middleware",
    );
  });
});
