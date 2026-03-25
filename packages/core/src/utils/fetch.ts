import { normalizeHttpMethod } from "./helpers";

export type CoreFetchInit = Omit<RequestInit, "method"> & {
  json?: unknown;
  searchParams?: string | URLSearchParams | Record<string, string>;
  timeout?: number;
};

export function coreFetch(
  method: string,
  url: string,
  options: CoreFetchInit = {},
): Promise<Response> {
  const { json, searchParams, body, headers, timeout, signal, ...rest } = options;

  let fullUrl = url;
  if (searchParams) {
    const paramStr =
      searchParams instanceof URLSearchParams
        ? searchParams.toString()
        : typeof searchParams === "string"
          ? searchParams
          : new URLSearchParams(searchParams as Record<string, string>).toString();
    if (paramStr) {
      fullUrl += (fullUrl.includes("?") ? "&" : "?") + paramStr;
    }
  }

  const requestHeaders =
    headers instanceof Headers ? headers : new Headers((headers as HeadersInit) || undefined);

  let requestBody: BodyInit | null | undefined = body;
  if (json !== undefined) {
    requestBody = JSON.stringify(json);
    if (!requestHeaders.has("content-type")) {
      requestHeaders.set("content-type", "application/json");
    }
  }

  let finalSignal: AbortSignal | null | undefined = signal;
  if (timeout) {
    const timeoutSignal = AbortSignal.timeout(timeout);
    finalSignal = finalSignal ? AbortSignal.any([finalSignal, timeoutSignal]) : timeoutSignal;
  }

  return fetch(fullUrl, {
    ...rest,
    method: normalizeHttpMethod(method),
    headers: requestHeaders,
    body: requestBody,
    ...(finalSignal != null && { signal: finalSignal }),
  });
}
