import type { CourierRoutes, RouteMap } from "@noverax/courier/define";

import type { accountsApi } from "./api";

/* The routes of the proxy page, as a routes module names them: the app keeps no
   courier.config for Studio to write them from, so they are written here, held
   to the API's own marks and shapes by their type. */
const endpoints = {
  login: { type: "mutation" },
  me: { type: "query" },
} as const satisfies RouteMap<typeof accountsApi>;

export const accountsRoutes: CourierRoutes<typeof accountsApi, typeof endpoints> = {
  source: "accounts",
  endpoints,
};
