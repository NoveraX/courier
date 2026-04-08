import { createProxyQueryCaller } from "@noverax/nexus-react"
import type { api, encodedApi, middlewareApi } from "@/api"

export const q = createProxyQueryCaller<typeof api>("api")
export const encodedQ = createProxyQueryCaller<typeof encodedApi>("encodedApi")
export const middlewareQ = createProxyQueryCaller<typeof middlewareApi>("middlewareApi")
