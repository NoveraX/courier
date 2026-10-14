// Written by Courier Studio from courier.config.ts. Do not edit it:
// `courier-studio routes` writes it again from the endpoints marked .expose().

import type { CourierRoutes, RouteMap } from "@noverax/courier/define";

import type config from "./courier.config";

type Sources = (typeof config)["sources"];

const apiEndpoints = {
  "live.chat": { transport: "ws", bidirectional: true },
  "live.ticks": { transport: "sse" },
  "users.create": { type: "mutation" },
  "users.getAll": { type: "query" },
  "users.getById": { type: "query" },
} as const satisfies RouteMap<Sources["api"]>;

/** What a page's proxy client may call of `api`, and how it reaches each endpoint. */
export const apiRoutes: CourierRoutes<Sources["api"], typeof apiEndpoints> = {
  source: "api",
  endpoints: apiEndpoints,
};
