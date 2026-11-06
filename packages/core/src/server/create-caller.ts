import type { CallerDefaults } from "../caller";
import type { FlatClient, MixedClient, TypedClient } from "../client";
import { directClient } from "../client/direct-client";
import type {
  AnyDefinedApi,
  DefinedApi,
  DefinedFlatApi,
  DefinedMixedApi,
  EndpointRecord,
  GroupRecord,
} from "../define";
import { getSourceName } from "../define/api";
import { assertServerOptions } from "./assert-server-options";
import { provideServerCapabilities } from "./provide-server-capabilities";

/**
 * Create a typed client for direct mode in server code: a page's caller,
 * with the server's part lent to the process first. A call then reads the
 * user's session from the request its context names —
 * `createCaller(api, { context: { req } })` — or from the request a
 * registered adapter serves. The options only a server reads — `session`,
 * `forward`, the header lists — are checked as the caller is made.
 *
 * @example
 * ```ts
 * export async function GET(req: Request) {
 *   const caller = createCaller(api, { context: { req } });
 *   return Response.json(await caller.users.me());
 * }
 * ```
 */
export function createCaller<TGroups extends GroupRecord, TEndpoints extends EndpointRecord>(
  source: DefinedMixedApi<TGroups, TEndpoints>,
  defaults?: CallerDefaults,
): MixedClient<TGroups, TEndpoints>;

export function createCaller<TEndpoints extends EndpointRecord>(
  source: DefinedFlatApi<TEndpoints>,
  defaults?: CallerDefaults,
): FlatClient<TEndpoints>;

export function createCaller<TApi extends DefinedApi>(
  source: TApi,
  defaults?: CallerDefaults,
): TypedClient<TApi>;

/* A flat source defined with no endpoints yet is only its options, and the
   flat overload cannot tell its endpoints apart from them, so none matched. */
export function createCaller(
  source: DefinedFlatApi<Record<never, never>>,
  defaults?: CallerDefaults,
): FlatClient<Record<never, never>>;

export function createCaller(source: AnyDefinedApi, defaults: CallerDefaults = {}): unknown {
  assertServerOptions(source, getSourceName(source) ?? "api");
  provideServerCapabilities();
  return directClient(source, defaults);
}
