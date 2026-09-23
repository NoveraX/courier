/**
 * What a proxy call resolves to, and what it rejects with.
 *
 * Both proxy transports — fetch, and XHR for an upload with progress — read
 * the proxy's answer here, so a call resolves to the same shape whichever one
 * carried it.
 */

import { HTTPError } from "../errors";
import { getResponseData } from "../http-client/response";
import { isAbortError } from "../utils/abort";
import { parseRequestPayload, type RequestPayload } from "../utils/request-payload";

type ProxyRequestPayload = { body?: FormData; json?: Partial<RequestPayload> };

export function buildHttpError(
  status: number,
  headers: Headers,
  responseData: unknown,
  requestPayload: ProxyRequestPayload,
): HTTPError {
  const { options } = parseRequestPayload(requestPayload.body || requestPayload.json);
  const { rawData } = options ?? {};

  const data =
    rawData && typeof responseData === "object" && responseData !== null && "data" in responseData
      ? (responseData as { data: unknown }).data
      : responseData;

  return new HTTPError({ status, headers, data });
}

export async function readErrorResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { success: false, message: `HTTP ${response.status}` };
  }
}

/**
 * Read the proxy's answer into what the call resolves to.
 *
 * @param response - The proxy's HTTP response
 * @param requestPayload - The request, for its `rawData` option
 * @param stream - Whether the call asked for the unread body
 * @returns The data; with `.raw`, the response around it
 * @throws HTTPError when the proxy answered with an error status
 */
export async function readProxyAnswer(
  response: Response,
  requestPayload: ProxyRequestPayload,
  stream: boolean,
): Promise<unknown> {
  if (!response.ok) {
    const responseData = await readErrorResponse(response);
    throw buildHttpError(response.status, response.headers, responseData, requestPayload);
  }
  const raw = wantsRaw(requestPayload);
  /* The unread body, or with `.raw` the response around it — as in direct
     mode, where handing back the whole Response was a third shape. */
  if (stream) {
    return raw
      ? { status: response.status, headers: response.headers, data: response.body }
      : response.body;
  }
  /* The proxy answers a bodiless upstream status with an empty body, which
     `response.json()` read as a syntax error; direct mode reads it as `null`. */
  const body = await getResponseData(response, "json");
  return raw ? withHeaders(body) : body;
}

/**
 * A failure to reach the proxy, as the error a caller can recognise.
 *
 * Offline, a server that is not up, a DNS failure — the commonest failure a
 * browser sees — used to escape as a bare TypeError that `isHTTPError`
 * rejects and `onError` never saw. It is an HTTPError with status 0 and the
 * original as its cause, as in direct mode. A cancellation stays as it was.
 *
 * @param error - Whatever the request rejected with
 * @returns The error to reject the call with
 */
export function asProxyFailure(error: unknown): unknown {
  if (error instanceof HTTPError || isAbortError(error) || !(error instanceof Error)) return error;
  return new HTTPError(
    { status: 0, headers: new Headers(), data: { success: false, message: error.message } },
    { cause: error },
  );
}

function wantsRaw(requestPayload: ProxyRequestPayload): boolean {
  const { options } = parseRequestPayload(requestPayload.body || requestPayload.json);
  return options?.rawData === true;
}

/** `.raw` promises `Headers`; over the wire they travel as a plain object. */
function withHeaders(envelope: unknown): unknown {
  if (typeof envelope !== "object" || envelope === null || !("headers" in envelope)) {
    return envelope;
  }
  const { headers } = envelope as { headers: unknown };
  if (headers instanceof Headers || typeof headers !== "object" || headers === null) {
    return envelope;
  }
  return { ...envelope, headers: new Headers(headers as Record<string, string>) };
}
