import { createProxyCaller } from "@noverax/courier"
import { defineBoundary } from "@noverax/courier/define"
import type { api, middlewareApi } from "@/api"

export const caller = createProxyCaller<typeof api>("api")
export const middlewareCaller = createProxyCaller<typeof middlewareApi>("middlewareApi")

/* The reads the sharing and cancelling examples make, described for the browser, which then knows them for reads. */
const reads = defineBoundary({
  source: "api",
  expose: { "users.getAll": "query", "misc.slow": "query" },
})

export const readsCaller = createProxyCaller<typeof api>("api", { boundary: reads })
export const searchCaller = createProxyCaller<typeof api>("api", {
  boundary: reads,
  cancelPrevious: ["misc.slow"],
})
