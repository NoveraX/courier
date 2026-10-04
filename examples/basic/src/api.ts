import { courier, defineApi, defineGroup } from "@noverax/courier/define";

import { boundary } from "./boundary";

const { endpoint } = courier();

export interface User {
  id: string;
  name: string;
  email: string;
}

const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
    getById: endpoint.get(":id").variables<{ id: string }>().response<User>(),
    create: endpoint.post("").variables<{ name: string; email: string }>().response<User>(),
  },
});

/** The REST backend in `upstream.ts`, defined once for every caller. */
export const api = defineApi({
  baseURL: process.env.API_URL ?? "http://127.0.0.1:4401",
  boundary,
  groups: { users },
});

/** The sources the proxy serves, under the name browser callers use. */
export const sources = { api };
