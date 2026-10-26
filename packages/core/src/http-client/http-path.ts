import { pathWriter } from "../define/path-tag";
import { HTTPError } from "../errors";

/**
 * The `path` an HTTP closure's wire offers. A value it cannot take is
 * refused as a path's parameter is: no request was made, so "HTTP 400"
 * would say nothing, and the error says what is wrong with the path.
 *
 * @example
 * ```ts
 * httpPath`files/${"report:draft"}`; // → "files/report%3Adraft"
 * ```
 */
export const httpPath = pathWriter(
  (message) =>
    new HTTPError(
      { status: 400, headers: new Headers(), data: { success: false, message } },
      { message },
    ),
);
