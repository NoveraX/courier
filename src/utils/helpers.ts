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
  variables?: FormData | Record<string, unknown>,
  generatedPathOptions?: Record<string, unknown>,
  searchParametersParse?: (string: string) => Record<string, unknown>,
): [string, FormData | Record<string, unknown>, Record<string, unknown>] => {
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
  let source: FormDataEntryValue | string | undefined;
  let group: FormDataEntryValue | string | undefined;
  let query: FormDataEntryValue | string | undefined;
  let variables: FormData | Record<string, unknown> | undefined;
  let options: MethodsInstanceOptions<boolean> | undefined;

  if (isFormData(requestOptions)) {
    const { _source, _group, _query, _options, ..._variables } = Object.fromEntries(
      requestOptions.entries(),
    );

    source = _source;
    group = _group;
    query = _query;

    if (typeof _options === "string") {
      try {
        options = JSON.parse(_options);
      } catch {
        // options stays undefined
      }
    }

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
