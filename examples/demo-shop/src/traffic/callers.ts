import { createCaller, createProxyCaller } from "@noverax/courier";

import { shopRoutes } from "../../courier.routes";
import { payments } from "../api/payments";
import { PROXY_PATH } from "../api/proxy-path";
import { shop } from "../api/shop";

/**
 * What the shop's pages call: the shop, through the shop's server, at the
 * endpoints marked `.expose()`. A page would import the routes module
 * alone; this process is server code as well, and holds both.
 */
export const storefront = createProxyCaller(shopRoutes, { proxyPath: PROXY_PATH });

/** What the shop's server code calls: the shop and the payments provider themselves. */
export const backend = {
  shop: createCaller(shop),
  payments: createCaller(payments),
};
