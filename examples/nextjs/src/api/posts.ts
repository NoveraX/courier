import { type Endpoint, EndpointGroup } from "@noverax/nexus/datasource"

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

export class Posts extends EndpointGroup {
  constructor() {
    super({ prefix: "posts" })
  }

  getAll: Endpoint<PostsListResponse, { userId?: number }> = ({ get }) => get()

  getById: Endpoint<Post, { id: number }> = ({ get }) => get(":id")

  create: Endpoint<Post, { userId?: number; title: string; body: string; tags?: string[] }> = ({
    post,
  }) => post()
}

export type { Post, PostsListResponse }
