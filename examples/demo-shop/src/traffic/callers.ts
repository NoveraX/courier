import { createCaller, createProxyCaller } from "@noverax/courier";

import { boundary } from "../api/boundary";
import { payments } from "../api/payments";
import { shop } from "../api/shop";

/**
 * What the shop's pages call: the shop, through the shop's server, at the
 * endpoints the boundary names. A page would import the API as a type only;
 * this process is server code as well, and holds both.
 */
export const storefront = createProxyCaller<typeof shop>("shop", { boundary });

/** What the shop's server code calls: the shop and the payments provider themselves. */
export const backend = {
  shop: createCaller(shop),
  payments: createCaller(payments),
};
