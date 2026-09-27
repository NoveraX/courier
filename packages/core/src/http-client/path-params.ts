import { isFieldRecord } from "../utils/body-kind";
import { extractParamNames } from "../utils/helpers";
import { omitParams } from "../utils/url";

/**
 * Remove path-param keys from variables so they don't leak into query/body.
 * Variables that are not named values — a list, a scalar, a raw body — hold
 * no parameter and are returned whole.
 */
export function stripPathParams(path: string, variables: unknown): unknown {
  if (variables === undefined || variables === null) return undefined;
  const paramNames = extractParamNames(path);
  if (paramNames.length === 0) return variables;

  const rest = omitParams(variables, paramNames);
  return isFieldRecord(rest) && Object.keys(rest).length === 0 ? undefined : rest;
}

export function toHeadersInit(value: unknown): HeadersInit | undefined {
  if (value instanceof Headers) return value;
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && value !== null) return value as Record<string, string>;
  return undefined;
}
