import { createCaller } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";

import { API_URL } from "./api-url";

const { endpoint } = courier();

/** What the API saw of a call. */
export interface Seen {
  sid: string | null;
  cookie: string | null;
  requestId: string | null;
  referer: string | null;
}

export const accountsApi = defineApi({
  name: "accounts",
  baseURL: API_URL,
  session: { cookies: ["sid"], csrf: { cookie: "csrftoken", header: "x-csrftoken", from: "csrf" } },
  forward: { requestId: true, userAgent: true, clientAddress: true },
  endpoints: {
    /* The two the proxy page calls, which a page may call; the rest are the server's. */
    me: endpoint.get("me").response<Seen>().expose(),
    login: endpoint.post("login").variables<{ user: string }>().expose(),
    rename: endpoint.post("me/name").variables<{ name: string }>(),
    logout: endpoint.post("logout", { session: "unguarded" }),
  },
});

export const accounts = createCaller(accountsApi);
