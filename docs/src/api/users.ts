import { courier, defineGroup } from "@noverax/courier/define"

const { query, mutation } = courier()

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
    getAll: query
      .variables<{ page?: number; limit?: number; search?: string }>()
      .response<UsersListResponse>()
      .via((http) => http.get()),
    getById: query
      .variables<{ id: number }>()
      .response<User>()
      .via((http) => http.get(":id")),
    create: mutation
      .variables<{ name: string; email: string; role?: string }>()
      .response<User>()
      .via((http, vars) => http.post("", vars)),
    update: mutation
      .variables<{ id: number; name: string; email: string; role: string }>()
      .response<User>()
      .via((http, vars) => http.put(":id", vars)),
    patch: mutation
      .variables<{ id: number } & Partial<Omit<User, "id" | "createdAt">>>()
      .response<User>()
      .via((http, vars) => http.patch(":id", vars)),
    remove: mutation
      .variables<{ id: number }>()
      .response<null>()
      .via((http, vars) => http.del(":id", vars)),
    getUserPost: query
      .variables<{ id: number; postId: number }>()
      .response<UserPostResponse>()
      .via((http) => http.get(":id/posts/:postId")),
  },
})

export type { User, UsersListResponse }
