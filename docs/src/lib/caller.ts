import { createProxyCaller } from "@noverax/courier"

import { apiRoutes, middlewareApiRoutes } from "@/lib/routes"

export const caller = createProxyCaller(apiRoutes)
export const middlewareCaller = createProxyCaller(middlewareApiRoutes)

/* The cancelling example's caller: a newer slow read cancels the one in flight. */
export const searchCaller = createProxyCaller(apiRoutes, { cancelPrevious: ["misc.slow"] })
