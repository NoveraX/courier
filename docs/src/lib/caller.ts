import { createProxyCaller } from "@noverax/courier"
import type { api, middlewareApi } from "@/api"

export const caller = createProxyCaller<typeof api>("api")
export const middlewareCaller = createProxyCaller<typeof middlewareApi>("middlewareApi")
