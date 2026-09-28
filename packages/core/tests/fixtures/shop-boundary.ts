import { defineBoundary, type ProxyBoundary } from "../../src/define/index";
import type { shop } from "./shop-api";

/**
 * A boundary declared the way the proxy-mode docs show it: in its own module,
 * typed against an API that holds it in turn.
 */
export const shopBoundary: ProxyBoundary = defineBoundary<typeof shop>({
  source: "shop",
  expose: { "orders.list": "query" },
});
