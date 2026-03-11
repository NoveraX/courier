import { HttpClient } from "../http-client/index";
import type { AnyEndpoints, BaseOptions, Context } from "../http-client/types";

export const createHttpClient = (baseOption?: BaseOptions, context?: Context): HttpClient =>
  new HttpClient(baseOption, context);

export const isEndpointFn = (value: unknown): value is AnyEndpoints[string] =>
  typeof value === "function";

export const getEndpoint = (target: object, name: string): AnyEndpoints[string] | undefined => {
  if (!(name in target)) return undefined;
  // object has no index signature; in-narrowing validates property exists
  const endpoint = (target as Record<string, unknown>)[name];
  return isEndpointFn(endpoint) ? endpoint : undefined;
};
