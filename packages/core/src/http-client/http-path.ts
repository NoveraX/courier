import { pathWriter } from "../define/path-tag";
import { pathRefusal } from "../utils/url";

/**
 * The `path` an HTTP closure's wire offers: a value it cannot take is
 * refused as a path's parameter is, before any request is made.
 *
 * @example
 * ```ts
 * httpPath`files/${"report:draft"}`; // → "files/report%3Adraft"
 * ```
 */
export const httpPath = pathWriter(pathRefusal);
