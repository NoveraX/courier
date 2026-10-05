import { defineBoundary } from "@noverax/courier/define";

import { PROXY_PATH } from "./proxy-path";

/** The endpoints of the shop a page may call through the shop's server, and how. */
export const boundary = defineBoundary({
  source: "shop",
  proxyPath: PROXY_PATH,
  expose: {
    "products.list": "query",
    "products.search": "query",
    "products.get": "query",
    "products.reviews": "query",
    "cart.get": "query",
    "cart.add": "mutation",
    "cart.remove": "mutation",
    "orders.list": "query",
    "orders.get": "query",
    "orders.place": "mutation",
    "orders.cancel": "mutation",
    "account.me": "query",
    "live.orders": "stream",
    "live.deals": "stream",
    "live.support": "duplex",
  },
});
