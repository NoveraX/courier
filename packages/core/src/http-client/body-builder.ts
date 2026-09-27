import { HTTPError } from "../errors";
import { isFieldRecord, isRawBody, toBodyInit } from "../utils/body-kind";
import { isFormData, normalizeHttpMethod } from "../utils/helpers";
import { toQueryEntries } from "../utils/query-string";
import type { FetchOptions, HttpMethod, SearchParamsSerializer } from "./types";

export const toSearchParams = (
  variables: Record<string, unknown> | undefined,
  serializer?: SearchParamsSerializer,
): string | URLSearchParams | undefined => {
  if (!variables || Object.keys(variables).length === 0) return undefined;
  if (serializer) return serializer.stringify(variables);
  return new URLSearchParams(toQueryEntries(variables));
};

/**
 * Drop the fields whose value is `undefined`, and treat `null` as no
 * variables at all. Anything that is not a set of named fields — a list, a
 * scalar, form data, a raw body — is sent whole and returned untouched.
 */
export const stripUndefined = (variables: unknown): unknown => {
  if (isFieldRecord(variables)) {
    return Object.fromEntries(Object.entries(variables).filter(([, v]) => v !== undefined));
  }
  return variables ?? undefined;
};

/**
 * The form as it is sent: without the empty files it carries — an
 * `<input type="file">` left blank still submits one.
 *
 * The caller's FormData is copied rather than edited, so it can be sent
 * again, or by a retry, as it was built. `FormData.delete` would also have
 * removed every entry under the empty file's name, real files included.
 *
 * @param formData - The form the caller passed
 * @returns The form to send, the same object when nothing is dropped
 *
 * @example
 * ```ts
 * withoutEmptyFiles(form).getAll("files"); // the non-empty files, in order
 * ```
 */
export const withoutEmptyFiles = (formData: FormData): FormData => {
  const entries = [...formData.entries()];
  const isEmptyFile = (value: FormDataEntryValue): boolean =>
    value instanceof File && value.size === 0;
  if (!entries.some(([, value]) => isEmptyFile(value))) return formData;

  const sent = new FormData();
  for (const [key, value] of entries) {
    if (!isEmptyFile(value)) sent.append(key, value);
  }
  return sent;
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

/**
 * The body a write sends for its variables.
 *
 * Named fields are merged over `defaultBody` and serialized; form data and a
 * raw body are sent as they are; a list or a JSON scalar is sent as JSON on
 * its own, since there is nothing to merge a default into.
 */
export const buildRequestBody = (
  variables: unknown,
  defaultBody: Record<string, unknown>,
  bodySerializer?: (data: Record<string, unknown>) => BodyInit,
): Pick<FetchOptions, "body" | "json" | "duplex"> | undefined => {
  if (isFormData(variables)) return { body: withoutEmptyFiles(variables) };
  if (isRawBody(variables)) {
    /* `fetch` refuses a stream body unless it is told the request is sent
       while the response may already be arriving. */
    const streamed = typeof ReadableStream !== "undefined" && variables instanceof ReadableStream;
    return { body: toBodyInit(variables), ...(streamed && { duplex: "half" as const }) };
  }
  if (variables !== undefined && !isFieldRecord(variables)) return { json: variables };

  const json = { ...defaultBody, ...variables };
  if (Object.keys(json).length === 0) return undefined;

  if (bodySerializer) return { body: bodySerializer(json) };
  return { json };
};

/**
 * The named values a read puts in its query string.
 *
 * @throws HTTPError 400 for anything else — a list, a scalar or a body has no
 *   names to put there, and sending the request without it would answer a
 *   different question than the one asked
 */
function queryFields(method: HttpMethod, variables: unknown): Record<string, unknown> | undefined {
  if (variables === undefined || isFormData(variables)) return undefined;
  if (isFieldRecord(variables)) return variables;
  throw new HTTPError({
    status: 400,
    headers: new Headers(),
    data: {
      success: false,
      message: `${normalizeHttpMethod(method)} sends its variables in the query string, so they must be an object of named values`,
    },
  });
}

export const buildBody = (
  method: HttpMethod,
  variables: unknown,
  searchParameters: Record<string, unknown> | undefined,
  defaultBody: Record<string, unknown>,
  defaultQueryParams: Record<string, unknown> | undefined,
  serializer?: SearchParamsSerializer,
  bodySerializer?: (data: Record<string, unknown>) => BodyInit,
): Pick<FetchOptions, "body" | "json" | "duplex" | "searchParams"> | undefined => {
  const cleaned = stripUndefined(variables);

  switch (method) {
    case "head":
      return undefined;
    case "get":
    case "del":
      return buildSearchParams(
        queryFields(method, cleaned),
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
