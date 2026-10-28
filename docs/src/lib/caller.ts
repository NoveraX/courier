import { createProxyCaller } from "@noverax/courier"

import { apiRoutes, middlewareApiRoutes } from "@/lib/routes"

export const caller = createProxyCaller(apiRoutes)
export const middlewareCaller = createProxyCaller(middlewareApiRoutes)
