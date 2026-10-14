import { createProxyQueryCaller } from "@noverax/courier-react"

import { apiRoutes, encodedApiRoutes, middlewareApiRoutes } from "@/lib/routes"

export const q = createProxyQueryCaller(apiRoutes)
export const encodedQ = createProxyQueryCaller(encodedApiRoutes)
export const middlewareQ = createProxyQueryCaller(middlewareApiRoutes)
