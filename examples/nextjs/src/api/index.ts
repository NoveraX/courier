import { Request } from "@noverax/nexus/RequestClass"
import type { SearchParamsOption } from "ky"
import { Echo } from "./echo"
import { Files } from "./files"
import { Misc } from "./misc"
import { Posts } from "./posts"
import { Users } from "./users"

const API_URL = process.env.API_URL ?? "http://localhost:4000"

const groups = {
  users: new Users(),
  posts: new Posts(),
  files: new Files(),
  misc: new Misc(),
  echo: new Echo(),
}

class MockApi extends Request<typeof groups> {
  constructor() {
    super({
      baseURL: API_URL,
      groups,
    })
  }
}

// --- Encoding demo source ---

const encodedGroups = { echo: new Echo() }

class EncodedApi extends Request<typeof encodedGroups> {
  constructor() {
    super({
      baseURL: API_URL,
      groups: encodedGroups,
      bodyEncoder: (data: Record<string, unknown>) =>
        new URLSearchParams(Object.entries(data).map(([k, v]) => [k, String(v)])),
      searchParamsEncoder: (params: Record<string, unknown>): SearchParamsOption => {
        const sp = new URLSearchParams()
        for (const [key, value] of Object.entries(params)) {
          if (Array.isArray(value)) {
            for (const item of value) sp.append(`${key}[]`, String(item))
          } else {
            sp.append(key, String(value))
          }
        }
        return sp
      },
      defaultData: { apiVersion: "v2" },
      defaultQueryParams: { format: "json" },
    })
  }
}

// --- Hooks demo source ---

const hookedGroups = {
  users: new Users(),
  misc: new Misc(),
}

class HookedApi extends Request<typeof hookedGroups> {
  constructor() {
    super({
      baseURL: API_URL,
      groups: hookedGroups,
      onRequest: (info) => {
        console.log(`[nexus:onRequest] ${info.source} → ${info.group}:${info.query}`)
        return info
      },
      onResponse: (_info, response) => ({
        status: response.status,
        data: {
          ...(typeof response.data === "object" && response.data !== null
            ? (response.data as Record<string, unknown>)
            : { data: response.data }),
          _hooks: {
            transformedBy: "onResponse",
            timestamp: new Date().toISOString(),
          },
        },
      }),
      onError: (info, error) => {
        console.log(
          `[nexus:onError] ${info.source} → ${info.group}:${info.query} — ${error.status}`
        )
        return undefined
      },
    })
  }
}

const mockApi = new MockApi()
const encodedApi = new EncodedApi()
const hookedApi = new HookedApi()

export const methods = {
  mockApi,
  encodedApi,
  hookedApi,
}

type Methods = typeof methods

export type MethodsType = {
  [K in keyof Methods]: Methods[K]
}
