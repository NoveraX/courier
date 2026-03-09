import type { BaseOptions, GroupOptions, HttpMethods, HttpResponse } from "../instance/types";

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
export type GroupRecord = Record<string, DefinedGroup>;

/** Result of defineApi() */
export type DefinedApi<G extends GroupRecord = GroupRecord> = {
  options: BaseOptions & { groups: G };
};

/** Loose source type for executeRequest / createDirectRequest */
export type AnySource = {
  options?: BaseOptions & { groups?: Record<string, { options?: GroupOptions }> };
};

/** Record of named sources */
export type Sources = Record<string, AnySource>;
