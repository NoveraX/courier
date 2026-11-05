import { courier, defineApi } from "@noverax/courier/define";
import { env } from "$env/dynamic/private";

import { API_URL } from "./api-url.js";

const { endpoint } = courier();

/* The API a page takes the routes of from Courier's bundler plugin: one endpoint
   it opens to a page, and one it keeps the server's. Its address may come from
   SvelteKit's private environment, which the plugin reads as SvelteKit does. */
export const catalog = defineApi({
  name: "catalog",
  baseURL: env.CATALOG_API_URL || API_URL,
  endpoints: { profile: endpoint.get("me").expose(), audit: endpoint.get("audit") },
});
