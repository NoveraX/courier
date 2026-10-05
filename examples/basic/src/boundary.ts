import { defineBoundary } from "@noverax/courier/define";

import { PROXY_PATH } from "./proxy-path";

/** The endpoints a browser may call through the server, and how. */
export const boundary = defineBoundary({
  source: "api",
  proxyPath: PROXY_PATH,
  expose: {
    "users.getAll": "query",
    "users.getById": "query",
    "users.create": "mutation",
    "live.ticks": "stream",
    "live.chat": "duplex",
  },
});
