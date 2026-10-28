import type { BaseOptions, GroupOptions } from "../http-client/types";
import type { AnyEndpoint, ExposeMark } from "./marker";

/** Any endpoint a source or group may hold. */
export type AnyEndpointFn = AnyEndpoint;

/** Record of endpoint functions keyed by method name */
export type EndpointRecord = Record<string, AnyEndpointFn>;

/**
 * What a name no endpoint or group may take is kept for. No endpoint and no
 * group is one, so taking the name does not compile, and the error says what
 * the name is kept for; yet a type built on such a name — what a generic
 * factory of groups returns — keeps its shape, where `never` in its place
 * would reduce the whole type to `never` in a declaration file.
 *
 * A value typed `any` goes into this type as into every type but `never`,
 * so an endpoint or a group typed `any` under such a name compiles; it is
 * refused where it is defined, with `RESERVED_ENDPOINT_NAME`. Refusing it in
 * the types too would take a check generic over the record, which a factory
 * of groups over its own type parameter could no longer satisfy.
 */
interface NameKeptFor<TWhat extends string> {
  readonly "this name is kept for": TWhat;
}

/**
 * Names a client answers to itself — its `.raw` and `.with()` accessors —
 * so no group or endpoint may take them.
 */
type ClientAccessorNames = {
  readonly raw?: NameKeptFor<"the client's .raw accessor">;
  readonly with?: NameKeptFor<"the client's .with() accessor">;
};

/**
 * Endpoints a group or a source may be defined with: any name but `options`,
 * which holds the group's or the source's own settings beside them, and
 * `raw` or `with`, which a client answers itself.
 */
export type OwnEndpoints = EndpointRecord & {
  readonly options?: NameKeptFor<"the settings of the group or the source">;
} & ClientAccessorNames;

/** Groups a source or a group may be defined with: any name but `raw` or `with`, which a client answers itself. */
export type OwnGroups = GroupRecord & ClientAccessorNames;

/* Where an overload of a source takes no endpoints, or no groups: none fits, so a name
   written there fails where it is written, a kept one among them, as it does in the
   overload that takes them — and TypeScript, which marks the call when its overloads
   fail in different places, marks the name. */
/** No endpoints at all: what a source's overload for groups alone takes under `endpoints`. */
export type NoEndpoints = OwnEndpoints & Record<string, never>;

/** No groups at all: what a source's overload for endpoints alone takes under `groups`. */
export type NoGroups = OwnGroups & Record<string, never>;

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
  /* Held to the reserved names here as well as by the overload's constraint:
     TypeScript first reads an endpoint built in place as nothing to infer from,
     so `TEndpoints` takes its default, and an endpoint named `options` would be
     reported on the whole call rather than on its name. */
  /** The group's own endpoints, beside its groups */
  endpoints?: (TEndpoints & OwnEndpoints) | undefined;
  /** Groups inside this one, each reached under its name and its prefix after this one's */
  groups: TGroups;
};

/**
 * The `expose` a group or an API was defined with, kept as written — `true`,
 * `false`, or `undefined` where it says nothing; a flag that may be unset is
 * kept as one that may be anything, as it may leave the decision to the
 * level above — so the routes a page's client is typed from name exactly
 * the endpoints the proxy serves.
 */
type ExposeAsWritten<TExpose extends ExposeMark> = { expose?: TExpose };

/**
 * The mark a group or an API keeps of the `expose` it was written with: one
 * that may be unset may also leave the decision to the level above, so it
 * is kept as a mark that may be anything.
 *
 * @example
 * ```ts
 * type Kept = ExposeKept<false | undefined>; // boolean | undefined
 * ```
 */
export type ExposeKept<TExpose extends ExposeMark> = [TExpose] extends [undefined]
  ? undefined
  : undefined extends TExpose
    ? ExposeMark
    : TExpose;

/**
 * How a call writes its `expose`: with the key, whatever value it holds —
 * which keeps an `undefined` the value may be — or without it.
 */
export type ExposeWritten<TExpose extends ExposeMark> = { expose: TExpose } | { expose?: never };

/**
 * A type the call's own arguments decide, never the place the call is
 * written in: an `expose` a call leaves out stays unset, whatever a
 * surrounding `groups:` would accept.
 */
export type FromArguments<T> = [T][T extends unknown ? 0 : never];

/** Result of defineGroup() — endpoint functions merged with group options */
export type DefinedGroup<
  TEndpoints extends EndpointRecord = EndpointRecord,
  TExpose extends ExposeMark = ExposeMark,
> = TEndpoints & {
  options: GroupOptions & ExposeAsWritten<TExpose>;
};

/** Result of defineGroup() with groups inside it, kept under `options.groups` as a source keeps its own */
export type DefinedNestingGroup<
  TEndpoints extends EndpointRecord = EndpointRecord,
  TGroups extends GroupRecord = GroupRecord,
  TExpose extends ExposeMark = ExposeMark,
> = TEndpoints & { options: GroupOptions & { groups: TGroups } & ExposeAsWritten<TExpose> };

/** Constraint for groups parameter in defineApi() */
export type GroupRecord = Record<
  string,
  { options: GroupOptions; [key: string]: AnyEndpointFn | GroupOptions }
>;

/** Result of defineApi() with groups */
export type DefinedApi<
  TGroups extends GroupRecord = GroupRecord,
  TExpose extends ExposeMark = ExposeMark,
> = {
  options: BaseOptions & { groups: TGroups } & ExposeAsWritten<TExpose>;
};

/** Result of defineApi() with flat endpoints (no groups) */
export type DefinedFlatApi<
  TEndpoints extends EndpointRecord = EndpointRecord,
  TExpose extends ExposeMark = ExposeMark,
> = {
  options: BaseOptions & ExposeAsWritten<TExpose>;
} & TEndpoints;

/** Result of defineApi() with groups + flat endpoints */
export type DefinedMixedApi<
  TGroups extends GroupRecord = GroupRecord,
  TEndpoints extends EndpointRecord = EndpointRecord,
  TExpose extends ExposeMark = ExposeMark,
> = {
  options: BaseOptions & { groups: TGroups } & ExposeAsWritten<TExpose>;
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
