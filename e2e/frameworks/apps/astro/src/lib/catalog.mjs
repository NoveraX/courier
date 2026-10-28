import { courier, defineApi } from "@noverax/courier/define";

import { API_URL } from "./api-url.mjs";

const { endpoint } = courier();

/* The API a page takes the routes of from Courier's bundler plugin: one endpoint
   it opens to a page, and one it keeps the server's. */
export const catalog = defineApi({
  name: "catalog",
  baseURL: API_URL,
  endpoints: { profile: endpoint.get("me").expose(), audit: endpoint.get("audit") },
});
