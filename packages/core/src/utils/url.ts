import { HTTPError } from "../errors";
import type { SearchParamsSerializer } from "../http-client/types";
import { isFieldRecord } from "./body-kind";
import { isFormData } from "./helpers";

const MULTIPLE_SLASHES = /\/+/g;
const ABSOLUTE_URL = /^https?:\/\//i;
const PARAM_RE = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;

type CompileFn = (params: Record<string, unknown>) => string;
const compileCache = new Map<string, CompileFn>();

const cachedCompile = (path: string): CompileFn => {
  let fn = compileCache.get(path);
  if (!fn) {
    fn = (params: Record<string, unknown>) =>
      path.replace(PARAM_RE, (_, name: string) => encodePathParam(name, params[name]));
    compileCache.set(path, fn);
  }
  return fn;
};

/**
 * One path segment, from a parameter's own value.
 *
 * The value is read as given rather than as its string form, so `null` is
 * missing like `undefined` instead of the text "null", and the word
 * "undefined" is an ordinary value. `.` and `..` are refused: encoding does
 * not hide them, since URL parsing reads `%2E%2E` as `..` too, and the request
 * would reach a route above the one the endpoint declares — with whatever
 * credentials the server sends. An empty segment names another route as well.
 */
function encodePathParam(name: string, value: unknown): string {
  if (value === undefined || value === null) {
    throw new Error(
      `Missing required path parameter "${name}": pass it in the variables, or return it from pathOptions`,
    );
  }
  const segment = String(value);
  if (segment === "" || segment === "." || segment === "..") {
    throw new Error(`Path parameter ${name} cannot be "${segment}": it would change the route`);
  }
  return encodeURIComponent(segment);
}

export const extractParamNames = (path: string): string[] => {
  const names: string[] = [];
  const re = new RegExp(PARAM_RE.source, PARAM_RE.flags);
  for (let match = re.exec(path); match !== null; match = re.exec(path)) {
    if (match[1]) names.push(match[1]);
  }
  return names;
};

export const pathJoin = (parts: string[]): string =>
  parts.join("/").replace(MULTIPLE_SLASHES, "/").replace(/^\//, "");

export const resolveBasePath = (
  prefix: string,
  basePath?: string,
): { path: string; baseUrl?: string } => {
  if (!basePath) {
    return { path: prefix };
  }

  /* Only a scheme makes a path absolute; `httpbin/…` or `https-proxies` is an
     ordinary path segment. */
  if (ABSOLUTE_URL.test(basePath)) {
    const url = new URL(basePath);
    return { path: pathJoin([url.pathname]), baseUrl: url.origin };
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

  const paramNames = extractParamNames(urlPath);
  const newVariables = omitParams(variables, paramNames);

  for (const pathKey of paramNames) {
    pathKeys[pathKey] = pathOptions[pathKey];
  }

  try {
    const url = cachedCompile(urlPath)(pathKeys);

    return [url, newVariables, objectSearchParameters];
  } catch (error) {
    /* No request was made, so "HTTP 400" would say nothing: the error says
       what is wrong with the path itself. */
    if (error instanceof Error) {
      throw new HTTPError(
        { status: 400, headers: new Headers(), data: { success: false, message: error.message } },
        { message: error.message },
      );
    }

    throw error;
  }
};
