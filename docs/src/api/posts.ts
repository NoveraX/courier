import { courier, defineGroup } from "@noverax/courier/define"

const { query, mutation } = courier()

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
    getAll: query
      .variables<{ userId?: number }>()
      .response<PostsListResponse>()
      .via((http) => http.get()),
    getById: query
      .variables<{ id: number }>()
      .response<Post>()
      .via((http) => http.get(":id")),
    create: mutation
      .variables<{ userId?: number; title: string; body: string; tags?: string[] }>()
      .response<Post>()
      .via((http, vars) => http.post("", vars)),
  },
})

export type { Post, PostsListResponse }
