import { createProxyCaller } from "@noverax/courier";
import { routes } from "@noverax/courier/routes";

import type config from "./wide.config";

declare module "@noverax/courier/routes" {
  interface Register {
    config: typeof config;
  }
}

export const storefront = createProxyCaller(routes.shop);
