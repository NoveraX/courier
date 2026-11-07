import { courier, defineApi } from "@noverax/courier/define";

import { API_URL } from "./api-url";

const { endpoint } = courier();

/* The API that keeps the user's session, called from the app's server code. */
export const accountsApi = defineApi({
  name: "accounts",
  baseURL: API_URL,
  session: {
    cookies: ["sid"],
    csrf: { cookie: "csrftoken", header: "x-csrftoken", from: "csrf" },
  },
  forward: { requestId: true, userAgent: true, clientAddress: true },
  endpoints: {
    me: endpoint.get("me"),
    login: endpoint.post("login"),
    rename: endpoint.post("me/name"),
    logout: endpoint.post("logout", { session: "unguarded" }),
  },
});

export const outcome = (call: Promise<unknown>): Promise<string> =>
  call.then(
    () => "written",
    (error: { status?: number }) => `refused ${error.status ?? "?"}`,
  );
