import type {
  AnyDefinedApi,
  DefinedApi,
  DefinedFlatApi,
  DefinedMixedApi,
  EndpointRecord,
  GroupRecord,
} from "@noverax/courier/define";
import {
  type CallerDefaults,
  createCaller,
  type FlatClient,
  type MixedClient,
  type RequestContextProvider,
  registerRequestContext,
  type TypedClient,
} from "@noverax/courier/server";

/** `createServerCaller`, shaped like the API it is given, as `createCaller` is. */
export interface CreateServerCaller {
  <TGroups extends GroupRecord, TEndpoints extends EndpointRecord>(
    source: DefinedMixedApi<TGroups, TEndpoints>,
    defaults?: CallerDefaults,
  ): MixedClient<TGroups, TEndpoints>;
  <TEndpoints extends EndpointRecord>(
    source: DefinedFlatApi<TEndpoints>,
    defaults?: CallerDefaults,
  ): FlatClient<TEndpoints>;
  <TApi extends DefinedApi>(source: TApi, defaults?: CallerDefaults): TypedClient<TApi>;
  (
    source: DefinedFlatApi<Record<never, never>>,
    defaults?: CallerDefaults,
  ): FlatClient<Record<never, never>>;
}

/**
 * `createServerCaller` for one entry: a server's caller that registers the
 * entry's provider of the request being served as it is made, so its
 * calls take the user's session without anything else set up.
 *
 * @param provider - Finds the request TanStack Start is serving
 * @returns `createServerCaller`
 * @example
 * ```ts
 * export const createServerCaller = serverCallerOver(tanstackStartRequestContext);
 * ```
 */
export function serverCallerOver(provider: RequestContextProvider): CreateServerCaller {
  function createServerCaller<TGroups extends GroupRecord, TEndpoints extends EndpointRecord>(
    source: DefinedMixedApi<TGroups, TEndpoints>,
    defaults?: CallerDefaults,
  ): MixedClient<TGroups, TEndpoints>;
  function createServerCaller<TEndpoints extends EndpointRecord>(
    source: DefinedFlatApi<TEndpoints>,
    defaults?: CallerDefaults,
  ): FlatClient<TEndpoints>;
  function createServerCaller<TApi extends DefinedApi>(
    source: TApi,
    defaults?: CallerDefaults,
  ): TypedClient<TApi>;
  function createServerCaller(
    source: DefinedFlatApi<Record<never, never>>,
    defaults?: CallerDefaults,
  ): FlatClient<Record<never, never>>;
  function createServerCaller(source: AnyDefinedApi, defaults?: CallerDefaults): unknown {
    registerRequestContext(provider);
    return createCaller(source as DefinedApi, defaults);
  }
  return createServerCaller;
}
