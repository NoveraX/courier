import { HttpClient } from "../http-client/index";
import type { AnyEndpoints, BaseOptions, Context } from "../http-client/types";

export const createHttpClient = (baseOption?: BaseOptions, context?: Context): HttpClient =>
  new HttpClient(baseOption, context);

/**
 * Recognise a value stored in a group or source as an endpoint.
 *
 * A descriptor keeps its wire closure under `probe`, so it is identified by
 * carrying one rather than by being callable itself.
 */
export const isEndpointFn = (value: unknown): value is AnyEndpoints[string] => {
  if (typeof value === "function") return true;
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as { probe?: unknown }).probe === "function";
};

export const getEndpoint = (target: object, name: string): AnyEndpoints[string] | undefined => {
  if (!(name in target)) return undefined;
  // object has no index signature; in-narrowing validates property exists
  const endpoint = (target as Record<string, unknown>)[name];
  return isEndpointFn(endpoint) ? endpoint : undefined;
};
