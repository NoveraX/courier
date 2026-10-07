import { createCaller } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";

import { API_URL } from "./api-url.js";

const { endpoint } = courier();

export const accounts = createCaller(
  defineApi({
    name: "accounts",
    baseURL: API_URL,
    session: {
      cookies: ["sid"],
      csrf: { cookie: "csrftoken", header: "x-csrftoken", from: "csrf" },
    },
    forward: { requestId: true, userAgent: true, clientAddress: true },
    endpoints: {
      me: endpoint.get("me"),
      login: endpoint.post("login").variables<{ user: string }>(),
      rename: endpoint.post("me/name").variables<{ name: string }>(),
      logout: endpoint.post("logout", { session: "unguarded" }),
    },
  }),
);

export const outcome = (call: Promise<unknown>): Promise<string> =>
  call.then(
    () => "written",
    (error: { status?: number }) => `refused ${error.status ?? "?"}`,
  );
