import {
  type CallerDefaults,
  createCaller,
  type FlatClient,
  type MixedClient,
  registerRequestContext,
  type TypedClient,
} from "@noverax/courier";
import type {
  AnyDefinedApi,
  DefinedApi,
  DefinedFlatApi,
  DefinedMixedApi,
  EndpointRecord,
  GroupRecord,
} from "@noverax/courier/define";

import { nextRequestContext } from "./request-context";

/**
 * A caller for the server code of a Next.js App Router — pages, layouts,
 * Server Actions, Route Handlers — whose calls carry the session of an API
 * that keeps one, from the request being served.
 *
 * It registers `nextRequestContext` as it is made, so the request is read
 * wherever its module is loaded: also while `next build` renders pages ahead
 * of time, where reading the request is what tells Next.js that a page
 * belongs to each user and has to be rendered per request. Registered only
 * in `instrumentation.ts`, which a build does not run, such a page would be
 * built once, without anyone's session, and served to everyone.
 *
 * @param source - The API
 * @param defaults - What every call is made with, as for `createCaller`
 * @returns The caller, shaped like the API
 * @example
 * ```ts
 * // lib/api.server.ts
 * import { createServerCaller } from "@noverax/courier-next";
 * import { api } from "./api";
 *
 * export const server = createServerCaller(api);
 * ```
 */
export function createServerCaller<TGroups extends GroupRecord, TEndpoints extends EndpointRecord>(
  source: DefinedMixedApi<TGroups, TEndpoints>,
  defaults?: CallerDefaults,
): MixedClient<TGroups, TEndpoints>;
export function createServerCaller<TEndpoints extends EndpointRecord>(
  source: DefinedFlatApi<TEndpoints>,
  defaults?: CallerDefaults,
): FlatClient<TEndpoints>;
export function createServerCaller<TApi extends DefinedApi>(
  source: TApi,
  defaults?: CallerDefaults,
): TypedClient<TApi>;
export function createServerCaller(
  source: DefinedFlatApi<Record<never, never>>,
  defaults?: CallerDefaults,
): FlatClient<Record<never, never>>;
export function createServerCaller(source: AnyDefinedApi, defaults?: CallerDefaults): unknown {
  registerRequestContext(nextRequestContext);
  return createCaller(source as DefinedApi, defaults);
}
