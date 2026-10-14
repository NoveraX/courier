// Written by Courier Studio from courier.config.ts. Do not edit it:
// `courier-studio routes` writes it again from the endpoints marked .expose().

import type { CourierRoutes, RouteMap } from "@noverax/courier/define";

import type config from "./courier.config";

type Sources = (typeof config)["sources"];

const shopEndpoints = {
  "account.me": { type: "query" },
  "cart.add": { type: "mutation" },
  "cart.get": { type: "query" },
  "cart.remove": { type: "mutation" },
  "live.deals": { transport: "sse" },
  "live.orders": { transport: "sse" },
  "live.support": { transport: "ws", bidirectional: true },
  "orders.cancel": { type: "mutation" },
  "orders.get": { type: "query" },
  "orders.list": { type: "query" },
  "orders.place": { type: "mutation" },
  "products.get": { type: "query" },
  "products.list": { type: "query" },
  "products.reviews": { type: "query" },
  "products.search": { type: "query" },
} as const satisfies RouteMap<Sources["shop"]>;

/** What a page's proxy client may call of `shop`, and how it reaches each endpoint. */
export const shopRoutes: CourierRoutes<Sources["shop"], typeof shopEndpoints> = {
  source: "shop",
  endpoints: shopEndpoints,
};
