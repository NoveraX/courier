import { HTTPError } from "../errors";
import { fetchFailure } from "./transport-failure";
import type { ResponseType } from "./types";

/** Statuses the HTTP specification defines as carrying no body at all. */
const BODILESS = new Set([204, 205, 304]);

/**
 * Does the HTTP specification forbid this status a body?
 *
 * Reading and writing have to agree on this. The proxy's writer knew only
 * 204, so a 205 was turned into a 500 and a 304 — which any upstream
 * honouring `If-None-Match` sends — threw out of the handler entirely,
 * because `Response.json` refuses to attach a body to either.
 *
 * @param status - HTTP status code
 * @returns `true` for 204, 205 and 304
 */
export function isBodilessStatus(status: number): boolean {
  return BODILESS.has(status);
}

/**
 * Read a response body, treating "there is no body" as a value rather than
 * as a parse failure.
 *
 * A HEAD request's only standard success is a 200 with no body, and a write
 * that returns nothing answers the same way. Handing those to `JSON.parse`
 * raises a syntax error, which the catch below turns into an `HTTPError`
 * carrying status 200 — a success reported as a transport failure, and
 * indistinguishable from one.
 */
export async function getResponseData(
  response: Response,
  responseType: ResponseType,
  responseParser?: (response: Response) => Promise<unknown>,
  message?: string,
): Promise<unknown> {
  if (BODILESS.has(response.status)) {
    return null;
  }

  let body: string;
  try {
    if (responseParser) return await responseParser(response);
    if (responseType !== "json") return await readAs(response, responseType);
    /* Reading the text first is what distinguishes an empty body from a
       malformed one; `response.json()` reports both as a syntax error. */
    body = await response.text();
  } catch (error) {
    throw readFailure(response, message, error);
  }

  if (body === "") return null;
  try {
    return JSON.parse(body);
  } catch (error) {
    /* An error answer's body is the upstream's explanation, in whatever
       form it wrote it; replacing text or HTML with "HTTP 404" lost it. */
    if (!response.ok) return body;
    throw unreadable(response, message, error);
  }
}

function readAs(response: Response, responseType: Exclude<ResponseType, "json">): Promise<unknown> {
  switch (responseType) {
    case "text":
      return response.text();
    case "blob":
      return response.blob();
    case "arrayBuffer":
      return response.arrayBuffer();
    case "formData":
      return response.formData();
  }
}

/** The error an answer whose body could not be read is thrown as, with its status. */
function unreadable(response: Response, message: string | undefined, cause: unknown): HTTPError {
  return new HTTPError(
    {
      status: response.status,
      headers: response.headers,
      data: { success: false, message: message || "Failed to parse response body" },
    },
    { cause },
  );
}

export async function getResponse(
  response: Response,
  responseType: ResponseType,
  responseParser?: (response: Response) => Promise<unknown>,
  message?: string,
): Promise<{ status: number; headers: Headers; data: unknown }> {
  const data = await getResponseData(response, responseType, responseParser, message);
  const { status, headers } = response;
  return { status, headers, data };
}

/* A body that stops arriving — its timeout ran out, or the connection
   dropped — is the request failing, as it would before the answer: a
   timeout or a network failure, not a body that would not parse. */
function readFailure(response: Response, message: string | undefined, error: unknown): unknown {
  const stopped =
    error instanceof Error && (error.name === "TimeoutError" || error instanceof TypeError);
  return stopped ? fetchFailure(error, undefined, undefined) : unreadable(response, message, error);
}
