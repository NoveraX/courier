import { type Endpoint, EndpointGroup } from "@noverax/nexus/datasource"

type User = {
  id: number
  name: string
  email: string
  role: "admin" | "user" | "moderator"
  createdAt: string
}

type UsersListResponse = {
  data: User[]
  total: number
  page: number
  limit: number
}

type UserPostResponse = {
  user: User
  post: {
    id: number
    userId: number
    title: string
    body: string
    tags: string[]
    createdAt: string
  }
}

export class Users extends EndpointGroup {
  constructor() {
    super({ prefix: "users" })
  }

  getAll: Endpoint<UsersListResponse, { page?: number; limit?: number; search?: string }> = ({
    get,
  }) => get()

  getById: Endpoint<User, { id: number }> = ({ get }) => get(":id")

  create: Endpoint<User, { name: string; email: string; role?: string }> = ({ post }) => post()

  update: Endpoint<User, { id: number; name: string; email: string; role: string }> = ({ put }) =>
    put(":id")

  patch: Endpoint<User, { id: number } & Partial<Omit<User, "id" | "createdAt">>> = ({ patch }) =>
    patch(":id")

  remove: Endpoint<null, { id: number }> = ({ del }) => del(":id")

  getUserPost: Endpoint<UserPostResponse, { id: number; postId: number }> = ({ get }) =>
    get(":id/posts/:postId")
}

export type { User, UsersListResponse }
