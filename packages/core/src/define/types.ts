import type { BaseOptions, GroupOptions, HttpMethods, HttpResponse } from "../http-client/types";

/** Typed endpoint function — the core building block */
export type Endpoint<TResponse, TVariables = undefined> = (
  methods: HttpMethods,
  variables: TVariables,
) => HttpResponse<TResponse> | Promise<HttpResponse<TResponse>>;

/** Record of endpoint functions keyed by method name */
export type EndpointRecord = Record<string, Endpoint<any, any>>;

/** Configuration for defineGroup() */
export type DefineGroupConfig<TEndpoints extends EndpointRecord> = GroupOptions & {
  endpoints: TEndpoints;
};

/** Result of defineGroup() — endpoint functions merged with group options */
export type DefinedGroup<TEndpoints extends EndpointRecord = EndpointRecord> = TEndpoints & {
  options: GroupOptions;
};

/** Constraint for groups parameter in defineApi() */
export type GroupRecord = Record<
  string,
  { options: GroupOptions; [key: string]: Endpoint<any, any> | GroupOptions }
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

/** Loose source type for executeRequest / createRequest */
export type AnySource = {
  options?: BaseOptions & { groups?: Record<string, { options?: GroupOptions }> };
};

/** Record of named sources */
export type Sources = Record<string, AnySource>;
