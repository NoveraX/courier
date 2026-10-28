import { createProxyCaller } from "@noverax/courier";
import { routes } from "@noverax/courier/routes";

export const storefront = createProxyCaller(routes.shop);
