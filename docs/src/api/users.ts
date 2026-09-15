import { defineGroup, endpoint } from "@noverax/courier/define"

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
    getAll: endpoint<UsersListResponse, { page?: number; limit?: number; search?: string }>()(
      (http) => http.get()
    ),
    getById: endpoint<User, { id: number }>()((http) => http.get(":id")),
    create: endpoint<User, { name: string; email: string; role?: string }>()((http, vars) =>
      http.post("", vars)
    ),
    update: endpoint<User, { id: number; name: string; email: string; role: string }>()(
      (http, vars) => http.put(":id", vars)
    ),
    patch: endpoint<User, { id: number } & Partial<Omit<User, "id" | "createdAt">>>()(
      (http, vars) => http.patch(":id", vars)
    ),
    remove: endpoint<null, { id: number }>()((http, vars) => http.del(":id", vars)),
    getUserPost: endpoint<UserPostResponse, { id: number; postId: number }>()((http) =>
      http.get(":id/posts/:postId")
    ),
  },
})

export type { User, UsersListResponse }
