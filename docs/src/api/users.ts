import { courier, defineGroup } from "@noverax/courier/define"

const { endpoint } = courier()

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

export const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint
      .variables<{ page?: number; limit?: number; search?: string }>()
      .response<UsersListResponse>()
      .get(""),
    getById: endpoint
      .variables<{ id: number }>()
      .response<User>()
      .get(":id"),
    create: endpoint
      .variables<{ name: string; email: string; role?: string }>()
      .response<User>()
      .post(""),
    update: endpoint
      .variables<{ id: number; name: string; email: string; role: string }>()
      .response<User>()
      .put(":id"),
    patch: endpoint
      .variables<{ id: number } & Partial<Omit<User, "id" | "createdAt">>>()
      .response<User>()
      .patch(":id"),
    remove: endpoint
      .variables<{ id: number }>()
      .response<null>()
      .del(":id"),
    getUserPost: endpoint
      .variables<{ id: number; postId: number }>()
      .response<UserPostResponse>()
      .get(":id/posts/:postId"),
  },
})

export type { User, UsersListResponse }
