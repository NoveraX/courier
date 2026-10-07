import { courier, defineApi } from "@noverax/courier/define";
import { createServerCaller } from "@noverax/courier-next";

import { API_URL } from "./api-url";

const { endpoint } = courier();

/** What the API saw of a call. */
export interface Seen {
  sid: string | null;
  cookie: string | null;
  requestId: string | null;
  referer: string | null;
}

export const api = defineApi({
  name: "accounts",
  baseURL: API_URL,
  session: { cookies: ["sid"], csrf: { cookie: "csrftoken", header: "x-csrftoken", from: "csrf" } },
  forward: { requestId: true, userAgent: true },
  endpoints: {
    me: endpoint.get("me").response<Seen>(),
    login: endpoint.post("login").variables<{ user: string }>(),
    rename: endpoint.post("me/name").variables<{ name: string }>(),
    logout: endpoint.post("logout", { session: "unguarded" }),
    b64: endpoint.get("b64").response<Seen>(),
  },
});

export const client = createServerCaller(api);
