import { createHash } from "node:crypto"
import { courier, defineGroup } from "@noverax/courier/define"
import { cacheMiddleware } from "@noverax/courier/middleware"
import type { MiddlewareContext } from "@noverax/courier/server"

import { VISITOR_ADDRESS_HEADER } from "../../server/visitor-address"

const { endpoint } = courier()

/* Whose copy of the posts a read is: the visitor's address, as the site's server reads it, and
   the digest of their cookies, which their data is kept under — never a cookie itself. */
function visitorScope(ctx: MiddlewareContext): string {
  const cookies = ctx.request?.headers.get("cookie") ?? ""
  const digest = createHash("sha256").update(cookies).digest("base64url")
  return `${ctx.headers.get(VISITOR_ADDRESS_HEADER) ?? ""} ${digest}`
}

type Post = {
  id: number
  userId: number
  title: string
  body: string
  tags: string[]
  createdAt: string
}

type PostsListResponse = {
  data: Post[]
  total: number
}

export const posts = defineGroup({
  prefix: "posts",
  endpoints: {
    getAll: endpoint.get("").variables<{ userId?: number }>().response<PostsListResponse>(),
    getById: endpoint.get(":id").variables<{ id: number }>().response<Post>(),
    /* The posts, a read kept on the server for 30 s, a copy for each visitor. */
    cached: endpoint
      .get("")
      .use(cacheMiddleware({ scope: visitorScope, ttl: 30_000, maxEntries: 200 }))
      .response<PostsListResponse>(),
    create: endpoint
      .post("")
      .variables<{ userId?: number; title: string; body: string; tags?: string[] }>()
      .response<Post>(),
  },
})

export type { Post, PostsListResponse }
