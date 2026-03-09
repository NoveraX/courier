import { Datasource } from "@noverax/nexus/datasource"
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

class MockApi extends Datasource<typeof groups> {
  constructor() {
    super({
      baseURL: API_URL,
      groups,
    })
  }
}

// --- Encoding demo source ---

const encodedGroups = { echo: new Echo() }

class EncodedApi extends Datasource<typeof encodedGroups> {
  constructor() {
    super({
      baseURL: API_URL,
      groups: encodedGroups,
      bodySerializer: (data: Record<string, unknown>) =>
        new URLSearchParams(Object.entries(data).map(([k, v]) => [k, String(v)])),
      searchParamsSerializer: {
        stringify: (params: Record<string, unknown>) => {
          const sp = new URLSearchParams()
          for (const [key, value] of Object.entries(params)) {
            if (Array.isArray(value)) {
              for (const item of value) sp.append(`${key}[]`, String(item))
            } else {
              sp.append(key, String(value))
            }
          }
          return sp.toString()
        },
        parse: (str: string) => Object.fromEntries(new URLSearchParams(str).entries()),
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

class HookedApi extends Datasource<typeof hookedGroups> {
  constructor() {
    super({
      baseURL: API_URL,
      groups: hookedGroups,
      onRequest: (info) => {
        console.log(`[nexus:onRequest] ${info.source} → ${info.group}:${info.method}`)
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
          `[nexus:onError] ${info.source} → ${info.group}:${info.method} — ${error.status}`
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
