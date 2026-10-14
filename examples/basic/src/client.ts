import { createProxyCaller } from "@noverax/courier";

import { apiRoutes } from "../courier.routes";
import { PROXY_PATH } from "./proxy-path";

/**
 * What a page calls. Its one value from the API is the routes module, which
 * Studio writes from the endpoints marked `.expose()`, so the upstream's
 * address and paths never ship with it.
 */
export const caller = createProxyCaller(apiRoutes, { proxyPath: PROXY_PATH });
