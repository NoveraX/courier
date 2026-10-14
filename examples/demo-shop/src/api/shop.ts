import { defineApi } from "@noverax/courier/define";

import { PORTS } from "../ports";
import { requestId } from "./middleware";
import { PROXY_PATH } from "./proxy-path";
import { products } from "./shop-catalog";
import { account, cart, orders } from "./shop-checkout";
import { live } from "./shop-live";

/** The shop's REST backend in `upstream/`, defined once for its server, its pages and its mock. */
export const shop = defineApi({
  baseURL: `http://127.0.0.1:${PORTS.shop}`,
  proxyPath: PROXY_PATH,
  /* A page may call every endpoint of the shop through the shop's server; the payments provider it calls none. */
  expose: true,
  middleware: [requestId],
  groups: { products, cart, orders, account, live },
});
