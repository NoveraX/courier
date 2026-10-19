import { isFieldRecord } from "../utils/body-kind";
import { pathParamNames } from "../utils/path-template";
import { omitParams } from "../utils/url";

/**
 * Remove path-param keys from variables so they don't leak into query/body.
 * Variables that are not named values — a list, a scalar, a raw body — hold
 * no parameter and are returned whole.
 */
export function stripPathParams(path: string, variables: unknown): unknown {
  if (variables === undefined || variables === null) return undefined;
  const paramNames = pathParamNames(path);
  if (paramNames.length === 0) return variables;

  const rest = omitParams(variables, paramNames);
  return isFieldRecord(rest) && Object.keys(rest).length === 0 ? undefined : rest;
}
