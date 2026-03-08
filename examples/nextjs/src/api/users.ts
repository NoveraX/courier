import { type Method, RequestGroup } from "@noverax/nexus/RequestClass";

type User = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user" | "moderator";
  createdAt: string;
};

type UsersListResponse = {
  data: User[];
  total: number;
  page: number;
  limit: number;
};

type UserPostResponse = {
  user: User;
  post: {
    id: number;
    userId: number;
    title: string;
    body: string;
    tags: string[];
    createdAt: string;
  };
};

export class Users extends RequestGroup {
  constructor() {
    super({ prefix: "users" });
  }

  getAll: Method<UsersListResponse, { page?: number; limit?: number; search?: string }> = ({
    get,
  }) => get();

  getById: Method<User, { id: number }> = ({ get }) => get(":id");

  create: Method<User, { name: string; email: string; role?: string }> = ({ post }) => post();

  update: Method<User, { id: number; name: string; email: string; role: string }> = ({ put }) =>
    put(":id");

  patch: Method<User, { id: number } & Partial<Omit<User, "id" | "createdAt">>> = ({ patch }) =>
    patch(":id");

  remove: Method<null, { id: number }> = ({ del }) => del(":id");

  getUserPost: Method<UserPostResponse, { id: number; postId: number }> = ({ get }) =>
    get(":id/posts/:postId");
}

export type { User, UsersListResponse };
