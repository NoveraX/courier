import { isFieldRecord } from "../utils/body-kind";
import { extractParamNames, isFormData } from "../utils/helpers";

/**
 * Remove path-param keys from variables so they don't leak into query/body.
 * Variables that are not named values — a list, a scalar, a raw body — hold
 * no parameter and are returned whole.
 */
export function stripPathParams(path: string, variables: unknown): unknown {
  if (variables === undefined || variables === null) return undefined;
  const paramNames = extractParamNames(path);
  if (paramNames.length === 0) return variables;

  if (isFormData(variables)) {
    const copy = new FormData();
    for (const [k, v] of variables.entries()) {
      if (!paramNames.includes(k)) copy.append(k, v);
    }
    return copy;
  }
  if (!isFieldRecord(variables)) return variables;

  const copy = { ...variables };
  for (const name of paramNames) delete copy[name];
  return Object.keys(copy).length > 0 ? copy : undefined;
}

export function toHeadersInit(value: unknown): HeadersInit | undefined {
  if (value instanceof Headers) return value;
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && value !== null) return value as Record<string, string>;
  return undefined;
}
