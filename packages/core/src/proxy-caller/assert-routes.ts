import type { CourierRoutes } from "../define/routes";
import { ConfigurationError } from "../errors";
import { isRecord } from "../utils/is-record";

/* What a value is, for a message: "undefined", "null", "a list", "a string"… */
function described(value: unknown): string {
  if (value === undefined || value === null) return String(value);
  if (Array.isArray(value)) return "a list";
  if (isRecord(value)) return "an object with no source and endpoints";
  return `a ${typeof value}`;
}

/**
 * Refuse anything but the routes of one API where a page's proxy client is
 * made. A source missing from the routes, or a module that exports none,
 * would otherwise fail deeper in with a `TypeError` that names neither.
 *
 * @param routes - What the client was handed for its routes
 * @param where - The function that was handed it, named in the message
 * @throws ConfigurationError `ROUTES_INVALID` for anything but an object
 *   naming its `source` and holding its `endpoints`
 * @example
 * ```ts
 * assertRoutes(routes.shop, "createProxyCaller");
 * ```
 */
export function assertRoutes(routes: unknown, where: string): asserts routes is CourierRoutes {
  if (isRecord(routes) && typeof routes.source === "string" && isRecord(routes.endpoints)) return;
  throw new ConfigurationError(
    "ROUTES_INVALID",
    `[courier] ${where}() takes the routes of one API — routes.<source> from ` +
      "@noverax/courier/routes, or an export of the routes module `courier-cli routes` " +
      `writes — and was handed ${described(routes)}.`,
  );
}
