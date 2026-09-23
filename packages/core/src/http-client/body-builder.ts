import { isFormData } from "../utils/helpers";
import type { FetchOptions, HttpMethod, SearchParamsSerializer } from "./types";

export const toSearchParams = (
  variables: Record<string, unknown> | undefined,
  serializer?: SearchParamsSerializer,
): string | URLSearchParams | undefined => {
  if (!variables || Object.keys(variables).length === 0) return undefined;
  if (serializer) return serializer.stringify(variables);
  return new URLSearchParams(Object.entries(variables).map(([k, v]) => [k, String(v)]));
};

export const stripUndefined = (
  variables?: FormData | Record<string, unknown>,
): FormData | Record<string, unknown> | undefined => {
  if (isFormData(variables)) {
    for (const key of variables.keys()) {
      if (variables.get(key) === undefined) {
        variables.delete(key);
      }
    }
    return variables;
  }

  if (typeof variables === "object" && variables !== null) {
    return Object.fromEntries(Object.entries(variables).filter(([, v]) => v !== undefined));
  }

  return undefined;
};

/**
 * Remove the empty files a form carries — an `<input type="file">` left blank
 * still submits one.
 *
 * `FormData.delete` removes every entry under a name, so deleting the empty
 * file's name used to throw away the real files uploaded beside it. The
 * entries are rebuilt instead, in their original order.
 */
export const filterEmptyFiles = (formData: FormData): void => {
  const entries = [...formData.entries()];
  const isEmptyFile = (value: FormDataEntryValue): boolean =>
    value instanceof File && value.size === 0;
  if (!entries.some(([, value]) => isEmptyFile(value))) return;

  for (const key of new Set(entries.map(([key]) => key))) formData.delete(key);
  for (const [key, value] of entries) {
    if (!isEmptyFile(value)) formData.append(key, value);
  }
};

export const buildSearchParams = (
  variables: Record<string, unknown> | undefined,
  searchParameters: Record<string, unknown> | undefined,
  defaultQueryParams: Record<string, unknown> | undefined,
  serializer?: SearchParamsSerializer,
): Pick<FetchOptions, "searchParams"> | undefined => {
  const params = toSearchParams(
    { ...defaultQueryParams, ...searchParameters, ...variables },
    serializer,
  );
  return params ? { searchParams: params } : undefined;
};

export const buildRequestBody = (
  variables: FormData | Record<string, unknown> | undefined,
  defaultBody: Record<string, unknown>,
  bodySerializer?: (data: Record<string, unknown>) => BodyInit,
): Pick<FetchOptions, "body" | "json"> | undefined => {
  if (isFormData(variables)) {
    filterEmptyFiles(variables);
    return { body: variables };
  }

  const json = { ...defaultBody, ...variables };
  if (Object.keys(json).length === 0) return undefined;

  if (bodySerializer) return { body: bodySerializer(json) };
  return { json };
};

export const buildBody = (
  method: HttpMethod,
  variables: FormData | Record<string, unknown> | undefined,
  searchParameters: Record<string, unknown> | undefined,
  defaultBody: Record<string, unknown>,
  defaultQueryParams: Record<string, unknown> | undefined,
  serializer?: SearchParamsSerializer,
  bodySerializer?: (data: Record<string, unknown>) => BodyInit,
): Pick<FetchOptions, "body" | "json" | "searchParams"> | undefined => {
  const cleaned = stripUndefined(variables);

  switch (method) {
    case "head":
      return undefined;
    case "get":
    case "del":
      return buildSearchParams(
        isFormData(cleaned) ? undefined : cleaned,
        searchParameters,
        defaultQueryParams,
        serializer,
      );
    default:
      return {
        ...buildSearchParams(undefined, searchParameters, defaultQueryParams, serializer),
        ...buildRequestBody(cleaned, defaultBody, bodySerializer),
      };
  }
};
