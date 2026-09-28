import { defineBoundary } from "../../src/define/index";

/**
 * A boundary declared the way the proxy-mode docs show it: in its own module,
 * naming no API, and held by the API that checks it.
 */
export const shopBoundary = defineBoundary({
  source: "shop",
  expose: { "orders.list": "query" },
});
