import { courier, defineGroup } from "@noverax/courier/define"

const { endpoint } = courier()

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
    create: endpoint
      .post("")
      .variables<{ userId?: number; title: string; body: string; tags?: string[] }>()
      .response<Post>(),
  },
})

export type { Post, PostsListResponse }
