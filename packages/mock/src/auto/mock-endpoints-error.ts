import { CourierError } from "@noverax/courier";

/**
 * A mock that names, among the endpoints it answers, some its source does
 * not have. It does not start: it would pass every call to them on to the
 * source's server, which is not what its author meant.
 *
 * @example
 * ```ts
 * throw new MockEndpointsError(["orders.refnd"], ["orders.list", "orders.refund"]);
 * ```
 */
export class MockEndpointsError extends CourierError<"UNKNOWN_ENDPOINTS"> {
  /**
   * @param unknown - The names the source does not have
   * @param known - The names it has, to choose from
   */
  constructor(unknown: readonly string[], known: readonly string[]) {
    super(
      `[courier-mock] The mock answers ${unknown.map((name) => `"${name}"`).join(", ")}, which its source does not have. Its endpoints are ${known.join(", ")}.`,
      { code: "UNKNOWN_ENDPOINTS", context: { unknown: [...unknown] } },
    );
  }
}
