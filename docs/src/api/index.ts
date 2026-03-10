import { defineApi } from "@noverax/nexus/define"
import { logMiddleware } from "@noverax/nexus/middleware"
import { echo } from "./echo"
import { files } from "./files"
import { misc } from "./misc"
import { posts } from "./posts"
import { users } from "./users"

const API_URL = process.env.API_URL ?? "http://localhost:4000"

const api = defineApi({
  baseURL: API_URL,
  groups: { users, posts, files, misc, echo },
})

// --- Encoding demo source ---

const encodedApi = defineApi({
  baseURL: API_URL,
  groups: { echo },
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
  defaultBody: { apiVersion: "v2" },
  defaultQueryParams: { format: "json" },
})

// --- Middleware demo source ---

const middlewareApi = defineApi({
  baseURL: API_URL,
  middleware: [logMiddleware()],
  groups: { users, misc },
})

export const sources = {
  api,
  encodedApi,
  middlewareApi,
}

export type Sources = typeof sources
