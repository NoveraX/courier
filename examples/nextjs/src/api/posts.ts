import { type Method, RequestGroup } from "@noverax/nexus/RequestClass";

type Post = {
  id: number;
  userId: number;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
};

type PostsListResponse = {
  data: Post[];
  total: number;
};

export class Posts extends RequestGroup {
  constructor() {
    super({ prefix: "posts" });
  }

  getAll: Method<PostsListResponse, { userId?: number }> = ({ get }) => get();

  getById: Method<Post, { id: number }> = ({ get }) => get(":id");

  create: Method<Post, { userId?: number; title: string; body: string; tags?: string[] }> = ({
    post,
  }) => post();
}

export type { Post, PostsListResponse };
