import { defineApi } from "@noverax/courier/define"
import { logMiddleware } from "@noverax/courier/middleware"

import { VISITOR_COOKIE } from "../../server/visitor-cookie"
import { echo } from "./echo"
import { files } from "./files"
import { misc } from "./misc"
import { posts } from "./posts"
import { users } from "./users"

const API_URL = process.env.API_URL ?? "http://localhost:4000"

/* The backend keeps each visitor's users and posts under this cookie: Courier carries it between
   the browser and the backend — through the proxy route, and from the pages and Server Actions —
   and no other cookie of the site reaches the backend. */
const visitorSession = { cookies: [VISITOR_COOKIE] }

/* Each source's every endpoint is one an example calls from its page. */
export const api = defineApi({
  baseURL: API_URL,
  expose: true,
  session: visitorSession,
  groups: { users, posts, files, misc, echo },
})

// --- Encoding demo source ---

export const encodedApi = defineApi({
  baseURL: API_URL,
  expose: true,
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

export const middlewareApi = defineApi({
  baseURL: API_URL,
  expose: true,
  session: visitorSession,
  middleware: [logMiddleware()],
  groups: { users, misc },
})

export const sources = {
  api,
  encodedApi,
  middlewareApi,
}

export type Sources = typeof sources
