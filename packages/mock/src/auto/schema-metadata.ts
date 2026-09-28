import { isRecord } from "../is-record";
import type { SchemaMetadata } from "./route-types";

/**
 * The schema metadata core stamps on an endpoint, read off the stamp. Core
 * writes it under a symbol only it and the mock use, so an object there is
 * core's metadata; anything else means the endpoint has none.
 *
 * @param stamp - What the endpoint holds under core's schema symbol
 * @returns The metadata, or `undefined`
 * @example
 * ```ts
 * schemaMetadataOf(Reflect.get(endpoint, Symbol.for("courier.endpoint.schema")))?.response;
 * ```
 */
export function schemaMetadataOf(stamp: unknown): SchemaMetadata | undefined {
  return isRecord(stamp) ? stamp : undefined;
}
