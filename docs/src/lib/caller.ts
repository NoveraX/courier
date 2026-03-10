import { createProxyCaller } from "@noverax/nexus"
import type { api, middlewareApi } from "@/api"

export const caller = createProxyCaller<typeof api>("api")
export const middlewareCaller = createProxyCaller<typeof middlewareApi>("middlewareApi")
