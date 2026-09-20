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
    getAll: endpoint
      .variables<{ userId?: number }>()
      .response<PostsListResponse>()
      .get(""),
    getById: endpoint
      .variables<{ id: number }>()
      .response<Post>()
      .get(":id"),
    create: endpoint
      .variables<{ userId?: number; title: string; body: string; tags?: string[] }>()
      .response<Post>()
      .post(""),
  },
})

export type { Post, PostsListResponse }
