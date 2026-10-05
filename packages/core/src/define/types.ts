import type { BaseOptions, GroupOptions } from "../http-client/types";
import type { AnyEndpoint } from "./marker";

/** Any endpoint a source or group may hold. */
export type AnyEndpointFn = AnyEndpoint;

/** Record of endpoint functions keyed by method name */
export type EndpointRecord = Record<string, AnyEndpointFn>;

/**
 * Names a client answers to itself — its `.raw` and `.with()` accessors —
 * so no group or endpoint may take them.
 */
type ClientAccessorNames = { readonly raw?: never; readonly with?: never };

/**
 * Endpoints a group or a source may be defined with: any name but `options`,
 * which holds the group's or the source's own settings beside them, and
 * `raw` or `with`, which a client answers itself.
 */
export type OwnEndpoints = EndpointRecord & { readonly options?: never } & ClientAccessorNames;

/** Groups a source or a group may be defined with: any name but `raw` or `with`, which a client answers itself. */
export type OwnGroups = GroupRecord & ClientAccessorNames;

/** Configuration for defineGroup() */
export type DefineGroupConfig<TEndpoints extends EndpointRecord> = GroupOptions & {
  /** Map of named endpoint functions belonging to this group */
  endpoints: TEndpoints;
};

/** Configuration for defineGroup() with groups inside it */
export type DefineNestingGroupConfig<
  TEndpoints extends EndpointRecord,
  TGroups extends GroupRecord,
> = GroupOptions & {
  /** The group's own endpoints, beside its groups */
  endpoints?: TEndpoints | undefined;
  /** Groups inside this one, each reached under its name and its prefix after this one's */
  groups: TGroups;
};

/** Result of defineGroup() — endpoint functions merged with group options */
export type DefinedGroup<TEndpoints extends EndpointRecord = EndpointRecord> = TEndpoints & {
  options: GroupOptions;
};

/** Result of defineGroup() with groups inside it, kept under `options.groups` as a source keeps its own */
export type DefinedNestingGroup<
  TEndpoints extends EndpointRecord = EndpointRecord,
  TGroups extends GroupRecord = GroupRecord,
> = TEndpoints & { options: GroupOptions & { groups: TGroups } };

/** Constraint for groups parameter in defineApi() */
export type GroupRecord = Record<
  string,
  { options: GroupOptions; [key: string]: AnyEndpointFn | GroupOptions }
>;

/** Result of defineApi() with groups */
export type DefinedApi<TGroups extends GroupRecord = GroupRecord> = {
  options: BaseOptions & { groups: TGroups };
};

/** Result of defineApi() with flat endpoints (no groups) */
export type DefinedFlatApi<TEndpoints extends EndpointRecord = EndpointRecord> = {
  options: BaseOptions;
} & TEndpoints;

/** Result of defineApi() with groups + flat endpoints */
export type DefinedMixedApi<
  TGroups extends GroupRecord = GroupRecord,
  TEndpoints extends EndpointRecord = EndpointRecord,
> = {
  options: BaseOptions & { groups: TGroups };
} & TEndpoints;

/**
 * Whatever defineApi returns: grouped, flat, mixed, or flat with no endpoints
 * yet — which is its options alone, and which no other shape describes.
 */
export type AnyDefinedApi =
  | DefinedApi
  | DefinedFlatApi
  | DefinedMixedApi
  | DefinedFlatApi<Record<never, never>>;

/** Loose source type for executeRequest / createRequest */
export type AnySource = {
  options?: BaseOptions & { groups?: Record<string, { options?: GroupOptions }> };
};

/** Record of named sources */
export type Sources = Record<string, AnySource>;
