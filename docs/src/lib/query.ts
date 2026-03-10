import { createQueryCaller } from "@noverax/nexus-query"
import type { api, encodedApi, middlewareApi } from "@/api"

export const q = createQueryCaller<typeof api>("api")
export const encodedQ = createQueryCaller<typeof encodedApi>("encodedApi")
export const middlewareQ = createQueryCaller<typeof middlewareApi>("middlewareApi")
