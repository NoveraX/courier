// Written by Courier Studio from courier.config.ts. Do not edit it:
// `courier-studio routes` writes it again from the endpoints marked .expose().

import type { CourierRoutes, RouteMap } from "@noverax/courier/define"

import type config from "../../courier.config"

type Sources = (typeof config)["sources"]

const apiEndpoints = {
  "echo.retrieve": { type: "query" },
  "echo.send": { type: "mutation" },
  "files.upload": { type: "mutation" },
  "misc.error": { type: "query" },
  "misc.slow": { type: "query" },
  "misc.stream": { type: "query" },
  "posts.create": { type: "mutation" },
  "posts.getAll": { type: "query" },
  "posts.getById": { type: "query" },
  "users.create": { type: "mutation" },
  "users.getAll": { type: "query" },
  "users.getById": { type: "query" },
  "users.getUserPost": { type: "query" },
  "users.patch": { type: "mutation" },
  "users.remove": { type: "mutation" },
  "users.update": { type: "mutation" },
} as const satisfies RouteMap<Sources["api"]>

/** What a page's proxy client may call of `api`, and how it reaches each endpoint. */
export const apiRoutes: CourierRoutes<Sources["api"], typeof apiEndpoints> = {
  source: "api",
  endpoints: apiEndpoints,
}

const encodedApiEndpoints = {
  "echo.retrieve": { type: "query" },
  "echo.send": { type: "mutation" },
} as const satisfies RouteMap<Sources["encodedApi"]>

/** What a page's proxy client may call of `encodedApi`, and how it reaches each endpoint. */
export const encodedApiRoutes: CourierRoutes<Sources["encodedApi"], typeof encodedApiEndpoints> = {
  source: "encodedApi",
  endpoints: encodedApiEndpoints,
}

const middlewareApiEndpoints = {
  "misc.error": { type: "query" },
  "misc.slow": { type: "query" },
  "misc.stream": { type: "query" },
  "users.create": { type: "mutation" },
  "users.getAll": { type: "query" },
  "users.getById": { type: "query" },
  "users.getUserPost": { type: "query" },
  "users.patch": { type: "mutation" },
  "users.remove": { type: "mutation" },
  "users.update": { type: "mutation" },
} as const satisfies RouteMap<Sources["middlewareApi"]>

/** What a page's proxy client may call of `middlewareApi`, and how it reaches each endpoint. */
export const middlewareApiRoutes: CourierRoutes<
  Sources["middlewareApi"],
  typeof middlewareApiEndpoints
> = {
  source: "middlewareApi",
  endpoints: middlewareApiEndpoints,
}
