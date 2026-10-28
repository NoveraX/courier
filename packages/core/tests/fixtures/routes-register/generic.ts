import { createProxyCaller } from "@noverax/courier";
import type { ExposedRoutes } from "@noverax/courier/define";

/* A helper over the routes of any API, as a library of shared page clients would write. */
export function pageClient<TApi>(routes: ExposedRoutes<TApi>) {
  return createProxyCaller(routes);
}
