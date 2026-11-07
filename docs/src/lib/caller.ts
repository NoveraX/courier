import { createProxyCaller } from "@noverax/courier/client"

import { apiRoutes, middlewareApiRoutes } from "@/lib/routes"

export const caller = createProxyCaller(apiRoutes)
export const middlewareCaller = createProxyCaller(middlewareApiRoutes)
