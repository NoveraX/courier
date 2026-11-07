import { createProxyQueryCaller, createProxyQueryKeys } from "@noverax/courier-react"

import { apiRoutes, encodedApiRoutes, middlewareApiRoutes } from "@/lib/routes"

export const q = createProxyQueryCaller(apiRoutes)
/** The keys of `q`'s queries, as a mutation names those it fetches again once it succeeds. */
export const keys = createProxyQueryKeys(apiRoutes)
export const encodedQ = createProxyQueryCaller(encodedApiRoutes)
export const middlewareQ = createProxyQueryCaller(middlewareApiRoutes)
