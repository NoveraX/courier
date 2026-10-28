import { createProxyCaller } from "@noverax/courier";
import { routes } from "@noverax/courier/routes";

import type config from "./courier.config";

declare module "@noverax/courier/routes" {
  interface Register {
    config: typeof config;
  }
}

export const storefront = createProxyCaller(routes.shop);

/* Its expose is known only at run time, so a client of it compiles and its routes decide. */
export const vendor = createProxyCaller(routes.vendor);

export async function itemsInCart(): Promise<number> {
  await storefront.cart.add({ productId: 7 });
  // @ts-expect-error — orders.refund is marked .expose(false), so a page may not call it
  await storefront.orders.refund({ id: 1 });
  // @ts-expect-error — payments opens nothing to a page, so it has no routes
  void routes.payments;
  const cart = await storefront.cart.get();
  return cart.items.length;
}
