import { compile, type Key, parse } from "path-to-regexp";

import { HTTPError } from "../error";
import type { MethodKyResponse, MethodsInstanceOptions } from "../instance/types";

const MULTIPLE_SLASHES = /\/+/g;

export const pathJoin = (parts: string[]) =>
  parts.join("/").replace(MULTIPLE_SLASHES, "/").replace(/^\//, "");

export const parseQueryRequest = (queryRequest: string) => {
  const [queryGroup, queryMethod] = queryRequest.split(":");
  return {
    group: queryMethod ? queryGroup : undefined,
    query: queryMethod || queryGroup,
  };
};

export const getUrl = (prefix: string, basePath?: string) => {
  if (!basePath) {
    return { path: prefix };
  }

  if (basePath.startsWith("http")) {
    const url = new URL(basePath);
    return { path: pathJoin([url.pathname]), baseUrl: url.origin };
  }

  return { path: pathJoin([prefix, basePath]) };
};

export type ResponseType<T extends boolean = false, R = unknown> = T extends true
  ? MethodKyResponse<R>
  : R;

export const generateUrl = (
  urlPath_: string,
  variables?: Record<string, unknown>,
  generatedPathOptions?: Record<string, unknown>,
  searchParametersParse?: (string: string) => Record<string, unknown>,
): [string, Record<string, unknown>, Record<string, unknown>] => {
  const [urlPath, searchParameters] = urlPath_.split("?");
  const objectSearchParameters = searchParametersParse
    ? searchParametersParse(searchParameters || "")
    : Object.fromEntries(new URLSearchParams(searchParameters || "").entries());

  const variablesObject = isFormData(variables)
    ? Object.fromEntries(variables.entries())
    : variables;
  const newVariables = isFormData(variables) ? variables : { ...variables };
  const pathOptions = { ...generatedPathOptions, ...variablesObject };
  const pathKeys: Record<string, string> = {};

  const keysArray = parse(urlPath).tokens.filter(
    (path) => typeof path === "object" && "name" in path && typeof path.name === "string",
  ) as Key[];

  for (const key of keysArray) {
    const pathKey = key.name;

    if (isFormData(variables)) {
      variables.delete(pathKey.toString());
    } else {
      delete (newVariables as Record<string, unknown>)[pathKey];
    }

    pathKeys[pathKey] = String(pathOptions?.[pathKey]);
  }

  try {
    const url = compile(urlPath)(pathKeys);

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

export const getRequestOptions = (requestOptions: CreateRequestOptionsType) => {
  let source;
  let group;
  let query;
  let variables;
  let options;

  if (isFormData(requestOptions)) {
    const { _source, _group, _query, _options, ..._variables } = Object.fromEntries(
      requestOptions.entries(),
    );

    source = _source;
    group = _group;
    query = _query;
    options = _options;

    const formData = new FormData();

    for (const key in _variables) {
      if (Object.hasOwn(_variables, key)) {
        const value = _variables[key];
        formData.append(key, value);
      }
    }

    variables = formData;
  } else {
    source = requestOptions?.source;
    group = requestOptions?.group;
    query = requestOptions?.query;
    options = requestOptions?.options;
    variables = requestOptions?.variables;
  }

  if (typeof options === "string") {
    try {
      options = JSON.parse(options);
    } catch {
      options = {};
    }
  }

  return { source, group, query, options, variables };
};

export const headersToObject = (headers?: Headers) => {
  if (!headers) return;
  return Object.fromEntries(headers.entries());
};

export const isFormData = (variables: unknown): variables is FormData =>
  typeof FormData !== "undefined" && variables instanceof FormData;

export const isHeaders = (variables: unknown): variables is Headers =>
  typeof Headers !== "undefined" && variables instanceof Headers;

export type CreateRequestOptionsType = FormData | Partial<CreateRequestOptions> | undefined;

export type CreateRequestOptions = {
  source: string;
  group: string;
  query: string;
  variables: Record<string, unknown>;
  options: MethodsInstanceOptions<boolean>;
};
