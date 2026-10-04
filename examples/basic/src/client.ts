import { createProxyCaller } from "@noverax/courier";

import type { api } from "./api";
import { boundary } from "./boundary";

/**
 * What a page calls. It imports the API as a type and the boundary as its
 * only value, so the upstream's address and paths never ship with it. In a
 * browser the proxy path is relative — `/api/request` by default; this script
 * runs in Node, so it names the server.
 */
export const caller = createProxyCaller<typeof api>("api", {
  boundary,
  proxyPath: { http: "http://127.0.0.1:3001/api/request" },
});
