import { HTTPError } from "../errors";
import type { SearchParamsSerializer } from "../http-client/types";
import { isFieldRecord } from "./body-kind";
import { defineOwn } from "./define-own";
import { isFormData } from "./helpers";
import { pathJoin } from "./path-join";
import {
  encodePathValue,
  fillPathParams,
  pathParamNames,
  routeChangingPart,
} from "./path-template";

const ABSOLUTE_URL = /^https?:\/\//i;
/* An absolute URL's scheme and host, which end where its path, its query or a fragment starts. */
const ORIGIN = /^https?:\/\/[^/?#]*/i;

/* A path is filled where it is used: a cache of one closure per path kept a
   closure per distinct path for good, and saved nothing a replace costs. */
const fillPath = (path: string, params: Record<string, unknown>): string =>
  fillPathParams(path, (name, { keepsSlashes }) =>
    encodePathParam(name, params[name], keepsSlashes),
  );

/**
 * A parameter's place in the path, from its own value: one segment, or —
 * for `{+name}` — segments its slashes divide.
 *
 * The value is read as given rather than as its string form, so `null` is
 * missing like `undefined` instead of the text "null", and the word
 * "undefined" is an ordinary value. `.` and `..` are refused, whole or as a
 * part between slashes: encoding does not hide them, since URL parsing
 * reads `%2E%2E` as `..` too, and the request would reach a route above the
 * one the endpoint declares — with whatever credentials the server sends.
 * An empty segment names another route as well.
 */
function encodePathParam(name: string, value: unknown, keepsSlashes: boolean): string {
  if (value === undefined || value === null) {
    throw new Error(
      `Missing required path parameter "${name}": pass it in the variables, or return it from pathOptions`,
    );
  }
  const text = String(value);
  const part = routeChangingPart(text, keepsSlashes);
  if (part !== undefined) {
    const which = part === text ? "it" : `its part "${part}"`;
    throw new Error(`Path parameter ${name} cannot be "${text}": ${which} would change the route`);
  }
  return encodePathValue(text, keepsSlashes);
}

export const resolveBasePath = (
  prefix: string,
  basePath?: string,
): { path: string; baseUrl?: string } => {
  if (!basePath) {
    return { path: prefix };
  }

  /* Only a scheme makes a path absolute; `httpbin/…` or `https-proxies` is an
     ordinary path segment. Only its origin is parsed: parsed whole, the path
     came back with its braces encoded, so none was read as a parameter, and
     without its query or a #, which the path's reader sends or refuses. */
  if (ABSOLUTE_URL.test(basePath)) {
    const origin = ORIGIN.exec(basePath)?.[0] ?? "";
    return { path: pathJoin([basePath.slice(origin.length)]), baseUrl: new URL(origin).origin };
  }

  return { path: pathJoin([prefix, basePath]) };
};

/**
 * The variables without the entries that filled path parameters.
 *
 * Form data is copied rather than edited: it belongs to the caller, who may
 * send it again, or have a retry send it, and found the parameter gone.
 *
 * @param variables - The variables a call was given
 * @param names - The path parameters the path declares
 * @returns The remaining variables; a list, a scalar or a raw body unchanged
 *
 * @example
 * ```ts
 * omitParams({ id: 1, name: "a" }, ["id"]); // → { name: "a" }
 * ```
 */
export function omitParams(variables: unknown, names: readonly string[]): unknown {
  if (names.length === 0) return variables;
  if (isFormData(variables)) {
    const copy = new FormData();
    for (const [key, value] of variables.entries()) {
      if (!names.includes(key)) copy.append(key, value);
    }
    return copy;
  }
  if (!isFieldRecord(variables)) return variables;

  const copy = { ...variables };
  for (const name of names) delete copy[name];
  return copy;
}

/**
 * Fill a path's parameters and split off what is left of the variables.
 *
 * Only named values can fill a parameter: a list, a scalar or a raw body is
 * passed on whole, and the path takes its parameters from `pathOptions`.
 */
export const compileUrl = (
  rawUrlPath: string,
  variables?: unknown,
  generatedPathOptions?: Record<string, unknown>,
  searchParamsSerializer?: SearchParamsSerializer,
): [string, unknown, Record<string, unknown>] => {
  /* A closure's path is known only now; one a value interpolated a # into is refused too. */
  if (rawUrlPath.includes("#")) throw pathRefusal(FRAGMENT_IN_PATH);
  const [urlPath = "", searchParameters] = rawUrlPath.split("?");
  const objectSearchParameters = searchParamsSerializer
    ? searchParamsSerializer.parse(searchParameters || "")
    : Object.fromEntries(new URLSearchParams(searchParameters || "").entries());

  const variablesObject = isFormData(variables)
    ? Object.fromEntries(variables.entries())
    : isFieldRecord(variables)
      ? variables
      : undefined;
  /* A key `pathOptions` returns is the server's to decide — typically the
     tenant a session belongs to. Letting a variable of the same name win
     handed that choice to the caller, and through the proxy the caller is a
     browser. The key stays the server's even when its value is missing, so
     the call is refused rather than completed with the caller's value. */
  const pathOptions = { ...variablesObject, ...generatedPathOptions };
  const pathKeys: Record<string, unknown> = {};

  const paramNames = pathParamNames(urlPath);
  const newVariables = omitParams(variables, paramNames);

  /* Own values only: a parameter named `constructor` the call left out is missing, not Object's. */
  for (const pathKey of paramNames) {
    defineOwn(
      pathKeys,
      pathKey,
      Object.hasOwn(pathOptions, pathKey) ? pathOptions[pathKey] : undefined,
    );
  }

  try {
    const url = fillPath(urlPath, pathKeys);

    return [url, newVariables, objectSearchParameters];
  } catch (error) {
    if (error instanceof Error) throw pathRefusal(error.message);
    throw error;
  }
};

/** Why a path holding a `#` is refused when a call is addressed. */
export const FRAGMENT_IN_PATH =
  "A path holds a #, which never reaches the server: write %23 for a # it sends, or put a value into a closure's path with http.path";

/**
 * The error a call's path is refused with: no request was made, so
 * "HTTP 400" would say nothing, and the error says what is wrong with the
 * path itself.
 *
 * @param message - What is wrong with the path
 * @returns The error, status 400, its message in its data too
 * @example
 * ```ts
 * throw pathRefusal('Missing required path parameter "id"');
 * ```
 */
export function pathRefusal(message: string): HTTPError {
  return new HTTPError(
    { status: 400, headers: new Headers(), data: { success: false, message } },
    { message },
  );
}
