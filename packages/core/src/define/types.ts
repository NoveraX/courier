import type { BaseOptions, GroupOptions, HttpMethods, HttpResponse } from "../http-client/types";

/** Typed endpoint function — the core building block */
export type Endpoint<R, V = undefined> = (
  methods: HttpMethods,
  variables: V,
) => HttpResponse<R> | Promise<HttpResponse<R>>;

/** Record of endpoint functions keyed by method name */
export type EndpointRecord = Record<string, Endpoint<any, any>>;

/** Configuration for defineGroup() */
export type DefineGroupConfig<E extends EndpointRecord> = GroupOptions & {
  endpoints: E;
};

/** Result of defineGroup() — endpoint functions merged with group options */
export type DefinedGroup<E extends EndpointRecord = EndpointRecord> = E & {
  options: GroupOptions;
};

/** Constraint for groups parameter in defineApi() */
export type GroupRecord = Record<
  string,
  { options: GroupOptions; [key: string]: Endpoint<any, any> | GroupOptions }
>;

/** Result of defineApi() with groups */
export type DefinedApi<G extends GroupRecord = GroupRecord> = {
  options: BaseOptions & { groups: G };
};

/** Result of defineApi() with flat endpoints (no groups) */
export type DefinedFlatApi<E extends EndpointRecord = EndpointRecord> = {
  options: BaseOptions;
} & E;

/** Result of defineApi() with groups + flat endpoints */
export type DefinedMixedApi<
  G extends GroupRecord = GroupRecord,
  E extends EndpointRecord = EndpointRecord,
> = {
  options: BaseOptions & { groups: G };
} & E;

/** Loose source type for executeRequest / createRequest */
export type AnySource = {
  options?: BaseOptions & { groups?: Record<string, { options?: GroupOptions }> };
};

/** Record of named sources */
export type Sources = Record<string, AnySource>;
