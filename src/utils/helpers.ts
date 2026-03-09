import { compile, type Key, parse } from "path-to-regexp";

import { HTTPError } from "../error";
import type { CallOptions, SearchParamsSerializer } from "../instance/types";

const MULTIPLE_SLASHES = /\/+/g;

type CompiledFn = ReturnType<typeof compile>;
const compileCache = new Map<string, CompiledFn>();

const cachedCompile = (path: string): CompiledFn => {
  let fn = compileCache.get(path);
  if (!fn) {
    fn = compile(path);
    compileCache.set(path, fn);
  }
  return fn;
};

export const pathJoin = (parts: string[]) =>
  parts.join("/").replace(MULTIPLE_SLASHES, "/").replace(/^\//, "");

export const parseEndpointKey = (endpointKey: string) => {
  const [groupOrMethod, method] = endpointKey.split(":");
  return {
    group: method ? groupOrMethod : undefined,
    method: method || groupOrMethod,
  };
};

export const resolveBasePath = (prefix: string, basePath?: string) => {
  if (!basePath) {
    return { path: prefix };
  }

  if (basePath.startsWith("http")) {
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
  const [urlPath, searchParameters] = rawUrlPath.split("?");
  const objectSearchParameters = searchParamsSerializer
    ? searchParamsSerializer.parse(searchParameters || "")
    : Object.fromEntries(new URLSearchParams(searchParameters || "").entries());

  const variablesObject = isFormData(variables)
    ? Object.fromEntries(variables.entries())
    : variables;
  const newVariables = isFormData(variables) ? variables : { ...variables };
  const pathOptions = { ...generatedPathOptions, ...variablesObject };
  const pathKeys: Record<string, string> = {};

  const keysArray = parse(urlPath).tokens.filter(
    (token): token is Key =>
      typeof token === "object" && "name" in token && typeof token.name === "string",
  );

  for (const key of keysArray) {
    const pathKey = key.name;

    if (isFormData(newVariables)) {
      newVariables.delete(pathKey.toString());
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

export const parseRequestPayload = (requestPayload: RequestPayloadInput) => {
  let source: FormDataEntryValue | string | undefined;
  let group: FormDataEntryValue | string | undefined;
  let method: FormDataEntryValue | string | undefined;
  let variables: FormData | Record<string, unknown> | undefined;
  let options: CallOptions<boolean> | undefined;

  if (isFormData(requestPayload)) {
    const META_KEYS = new Set(["_source", "_group", "_method", "_options"]);

    source = requestPayload.get("_source") ?? undefined;
    group = requestPayload.get("_group") ?? undefined;
    method = requestPayload.get("_method") ?? undefined;

    const rawOptions = requestPayload.get("_options");
    if (typeof rawOptions === "string") {
      try {
        options = JSON.parse(rawOptions, (key, value) => {
          if (key === "__proto__" || key === "constructor" || key === "prototype") {
            return undefined;
          }
          return value;
        });
      } catch {
        // options stays undefined
      }
    }

    const formData = new FormData();

    for (const [key, value] of requestPayload.entries()) {
      if (!META_KEYS.has(key)) {
        formData.append(key, value);
      }
    }

    variables = formData;
  } else {
    source = requestPayload?.source;
    group = requestPayload?.group;
    method = requestPayload?.method;
    options = requestPayload?.options;
    variables = requestPayload?.variables;
  }

  return { source, group, method, options, variables };
};

export const headersToObject = (headers?: Headers) => {
  if (!headers) return;
  return Object.fromEntries(headers.entries());
};

export const isFormData = (variables: unknown): variables is FormData =>
  typeof FormData !== "undefined" && variables instanceof FormData;

export const isHeaders = (variables: unknown): variables is Headers =>
  typeof Headers !== "undefined" && variables instanceof Headers;

export type RequestPayloadInput = FormData | Partial<RequestPayload> | undefined;

export type RequestPayload = {
  source: string;
  group: string;
  method: string;
  variables: Record<string, unknown>;
  options: CallOptions<boolean>;
};
