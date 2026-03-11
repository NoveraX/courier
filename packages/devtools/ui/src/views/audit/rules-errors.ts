import type { SourceMap } from "../../store"
import type { FlatEndpoint } from "../explorer/helpers"
import type { AuditItem } from "./types"

function isValidURL(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export function collectErrors(
  sourceMap: SourceMap,
  endpoints: FlatEndpoint[],
  nextId: () => string
): AuditItem[] {
  const items: AuditItem[] = []

  for (const [sourceName, source] of Object.entries(sourceMap)) {
    if (Object.keys(source.groups ?? {}).length === 0) {
      items.push({ id: nextId(), severity: "error", title: "Empty source", description: `Source "${sourceName}" has no groups defined.`, suggestion: "Add at least one group with endpoints to this source.", endpoint: sourceName, category: "structure" })
    }
  }

  for (const [sourceName, source] of Object.entries(sourceMap)) {
    if (!source.baseURL || !isValidURL(source.baseURL)) {
      items.push({ id: nextId(), severity: "error", title: "Invalid base URL", description: `Source "${sourceName}" has an invalid or empty baseURL: "${source.baseURL || "(empty)"}"`, suggestion: "Set a valid base URL: defineApi({ baseURL: 'https://api.example.com', ... })", endpoint: sourceName, category: "structure" })
    }
  }

  for (const ep of endpoints) {
    if (ep.middleware.length === 0 && !ep.hasVariablesSchema && !ep.hasResponseSchema) {
      items.push({ id: nextId(), severity: "error", title: "No error handling", description: `${[ep.source, ep.group, ep.method].filter(Boolean).join(".")} has no middleware and no validation schemas.`, suggestion: "Add at least error handling middleware or validation schemas to protect against unexpected responses.", endpoint: `${[ep.source, ep.group, ep.method].filter(Boolean).join(".")}`, category: "reliability" })
    }
  }

  return items
}
