import type { SourceMap } from "../../store"

// ── Node ID delimiter (safe for source/group/method names that may contain dots) ──

export const NODE_DELIM = "::"

// ── Merged source map from all sessions ─────────────────────────────────────

export interface FlatEndpoint {
  source: string
  group: string
  method: string
  prefix: string
  baseURL: string
  type: "query" | "mutation"
  hasVariablesSchema: boolean
  hasResponseSchema: boolean
  middleware: string[]
}

export function mergeSourceMaps(sessions: { sources: SourceMap }[]): SourceMap {
  const merged: SourceMap = {}
  for (const session of sessions) {
    for (const [sourceName, source] of Object.entries(session.sources ?? {})) {
      // Later sessions replace earlier ones for the same source —
      // this ensures HMR renames/deletions are reflected correctly
      // when server and browser sessions report different snapshots.
      merged[sourceName] = structuredClone(source)
    }
  }
  return merged
}

export function flattenEndpoints(sourceMap: SourceMap): FlatEndpoint[] {
  const result: FlatEndpoint[] = []
  for (const [sourceName, source] of Object.entries(sourceMap)) {
    for (const [groupName, group] of Object.entries(source.groups ?? {})) {
      for (const [methodName, ep] of Object.entries(group.endpoints ?? {})) {
        result.push({
          source: sourceName,
          group: groupName,
          method: methodName,
          prefix: group.prefix,
          baseURL: source.baseURL,
          type: ep.type,
          hasVariablesSchema: ep.hasVariablesSchema ?? false,
          hasResponseSchema: ep.hasResponseSchema ?? false,
          middleware: ep.middleware ?? [],
        })
      }
    }
  }
  return result
}

// ── Demo source map for when no sessions are connected ──────────────────────

export function getDemoSourceMap(): SourceMap {
  return {
    api: {
      baseURL: "https://api.example.com",
      groups: {
        users: {
          prefix: "/users",
          endpoints: {
            getAll: { type: "query", hasVariablesSchema: false, hasResponseSchema: true, middleware: ["auth", "log"] },
            getById: { type: "query", hasVariablesSchema: true, hasResponseSchema: true, middleware: ["auth", "log"] },
            create: { type: "mutation", hasVariablesSchema: true, hasResponseSchema: true, middleware: ["auth", "log", "rateLimit"] },
            update: { type: "mutation", hasVariablesSchema: true, hasResponseSchema: true, middleware: ["auth", "log"] },
            delete: { type: "mutation", hasVariablesSchema: true, hasResponseSchema: false, middleware: ["auth", "log"] },
          },
        },
        posts: {
          prefix: "/posts",
          endpoints: {
            getAll: { type: "query", hasVariablesSchema: false, hasResponseSchema: true, middleware: ["log", "cache"] },
            getById: { type: "query", hasVariablesSchema: true, hasResponseSchema: true, middleware: ["log", "cache"] },
            create: { type: "mutation", hasVariablesSchema: true, hasResponseSchema: true, middleware: ["auth", "log"] },
            search: { type: "query", hasVariablesSchema: true, hasResponseSchema: true, middleware: ["log", "rateLimit"] },
          },
        },
        auth: {
          prefix: "/auth",
          endpoints: {
            login: { type: "mutation", hasVariablesSchema: true, hasResponseSchema: true, middleware: ["log", "rateLimit"] },
            refresh: { type: "mutation", hasVariablesSchema: true, hasResponseSchema: true, middleware: ["log"] },
            logout: { type: "mutation", hasVariablesSchema: false, hasResponseSchema: false, middleware: ["auth", "log"] },
          },
        },
      },
    },
  }
}
