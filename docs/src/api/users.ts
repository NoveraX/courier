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
    getAll: endpoint.get("").variables<{ page?: number; limit?: number; search?: string }>().response<UsersListResponse>(),
    getById: endpoint.get(":id").variables<{ id: number }>().response<User>(),
    create: endpoint.post("").variables<{ name: string; email: string; role?: string }>().response<User>(),
    update: endpoint.put(":id").variables<{ id: number; name: string; email: string; role: string }>().response<User>(),
    patch: endpoint.patch(":id").variables<{ id: number } & Partial<Omit<User, "id" | "createdAt">>>().response<User>(),
    remove: endpoint.del(":id").variables<{ id: number }>().response<null>(),
    getUserPost: endpoint.get(":id/posts/:postId").variables<{ id: number; postId: number }>().response<UserPostResponse>(),
  },
})

export type { User, UsersListResponse }
