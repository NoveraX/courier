import { defineGroup, endpoint } from "@noverax/courier/define"

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
    getAll: endpoint<PostsListResponse, { userId?: number }>()((http) => http.get()),
    getById: endpoint<Post, { id: number }>()((http) => http.get(":id")),
    create: endpoint<Post, { userId?: number; title: string; body: string; tags?: string[] }>()(
      (http, vars) => http.post("", vars)
    ),
  },
})

export type { Post, PostsListResponse }
