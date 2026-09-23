import { HTTPError } from "../errors";
import type { SearchParamsSerializer } from "../http-client/types";
import { isFormData } from "./helpers";

const MULTIPLE_SLASHES = /\/+/g;
const ABSOLUTE_URL = /^https?:\/\//i;
const PARAM_RE = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;

type CompileFn = (params: Record<string, string>) => string;
const compileCache = new Map<string, CompileFn>();

const cachedCompile = (path: string): CompileFn => {
  let fn = compileCache.get(path);
  if (!fn) {
    fn = (params: Record<string, string>) =>
      path.replace(PARAM_RE, (_, name: string) => {
        const value = params[name];
        if (value === undefined || value === null || value === "undefined") {
          throw new Error(`Missing required parameter: ${name}`);
        }
        return encodeURIComponent(String(value));
      });
    compileCache.set(path, fn);
  }
  return fn;
};

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

export const compileUrl = (
  rawUrlPath: string,
  variables?: FormData | Record<string, unknown>,
  generatedPathOptions?: Record<string, unknown>,
  searchParamsSerializer?: SearchParamsSerializer,
): [string, FormData | Record<string, unknown>, Record<string, unknown>] => {
  const [urlPath = "", searchParameters] = rawUrlPath.split("?");
  const objectSearchParameters = searchParamsSerializer
    ? searchParamsSerializer.parse(searchParameters || "")
    : Object.fromEntries(new URLSearchParams(searchParameters || "").entries());

  const variablesObject = isFormData(variables)
    ? Object.fromEntries(variables.entries())
    : variables;
  const newVariables = isFormData(variables) ? variables : { ...variables };
  const pathOptions = { ...generatedPathOptions, ...variablesObject };
  const pathKeys: Record<string, string> = {};

  const paramNames = extractParamNames(urlPath);

  for (const pathKey of paramNames) {
    if (isFormData(newVariables)) {
      newVariables.delete(pathKey);
    } else {
      delete newVariables[pathKey];
    }

    pathKeys[pathKey] = String(pathOptions?.[pathKey]);
  }

  try {
    const url = cachedCompile(urlPath)(pathKeys);

    return [url, newVariables, objectSearchParameters];
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPError({
        status: 400,
        headers: new Headers(),
        data: { success: false, message: error.message },
      });
    }

    throw error;
  }
};
