import { courier, defineApi, defineGroup } from "@noverax/courier/define";

import { API_URL } from "./api-url";

const { endpoint } = courier();

/** What the API saw of a call. */
export interface Seen {
  sid: string | null;
  cookie: string | null;
}

/* The same description of the session the server-rendered applications use. */
export const api = defineApi({
  name: "accounts",
  baseURL: API_URL,
  session: { cookies: ["sid"], csrf: { cookie: "csrftoken", header: "x-csrftoken" } },
  groups: {
    auth: defineGroup({
      endpoints: {
        signIn: endpoint.post("login").variables<{ user: string }>(),
        signOut: endpoint.post("logout", { session: "unguarded" }),
      },
    }),
    account: defineGroup({
      endpoints: {
        me: endpoint.get("me").response<Seen>(),
        rename: endpoint.post("me/name").variables<{ name: string }>().response<Seen>(),
      },
    }),
  },
});

/* An API that keeps no session: the browser sends it no cookies. */
export const publicApi = defineApi({
  name: "public",
  baseURL: API_URL,
  groups: { account: defineGroup({ endpoints: { me: endpoint.get("me").response<Seen>() } }) },
});
