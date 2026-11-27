import { HTTPError } from "../errors";
import { ConfigurationError } from "../errors/configuration-error";
import { CourierError } from "../errors/courier-error";
import type { Answer } from "../utils/answer";
import type { ResponseParser, ResponseType } from "./types";

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
 * Refuse an answer the platform hides: one to a request sent with
 * `mode: "no-cors"`, or a redirect a browser was told not to follow. Its
 * status reads 0 and its body as empty, and neither says what the server
 * answered, so it is no `HTTPError` and no network failure.
 *
 * @param response - The answer
 * @throws {ConfigurationError} `RESPONSE_OPAQUE`, for an answer nobody can read
 */
export function assertReadable(response: Response): void {
  if (response.type !== "opaque" && response.type !== "opaqueredirect") return;
  throw new ConfigurationError(
    "RESPONSE_OPAQUE",
    `The answer is opaque: mode "no-cors" or redirect "manual" hide its status and body`,
  );
}

/**
 * Read an answer's body into what a call resolves to, treating "there is no
 * body" as a value rather than as a parse failure: `null` for a status that
 * has none, or for an empty body read as JSON. A source's parser is handed
 * the body as `responseType` reads it, and the answer's status and headers.
 *
 * A HEAD request's only standard success is a 200 with no body, and a write
 * that returns nothing answers the same way. Handing those to `JSON.parse`
 * raises a syntax error, which the catch below turns into an `HTTPError`
 * carrying status 200 — a success reported as a transport failure, and
 * indistinguishable from one.
 *
 * @param answer - The answer, its body unread
 * @param responseType - What the body is read as
 * @param responseParser - Turns the body read into what the call resolves to
 * @param message - What an error answer that cannot be read says
 * @returns What the call resolves to
 * @throws {HTTPError} When a successful answer's body does not parse, or the parser throws
 * @example
 * ```ts
 * const data = await getResponseData(answer, "json");
 * ```
 */
export async function getResponseData(
  answer: Answer,
  responseType: ResponseType,
  responseParser?: ResponseParser,
  message?: string,
): Promise<unknown> {
  const { response } = answer;
  if (BODILESS.has(response.status)) return null;
  const body = await readData(answer, responseType, message);
  if (!responseParser) return body;
  try {
    return await responseParser(body, { status: response.status, headers: response.headers });
  } catch (error) {
    throw error instanceof CourierError ? error : unreadable(response, message, error);
  }
}

/* The body as `responseType` reads it. A read that fails was classified as it was read: the
   call's cancellation, its timeout, a body that stopped arriving. */
async function readData(
  answer: Answer,
  responseType: ResponseType,
  message: string | undefined,
): Promise<unknown> {
  if (responseType !== "json") return answer.read(responseType);
  /* Reading the text first is what distinguishes an empty body from a
     malformed one; `response.json()` reports both as a syntax error. */
  const body = await answer.read("text");
  if (body === "") return null;
  try {
    return JSON.parse(body);
  } catch (error) {
    /* An error answer's body is the upstream's explanation, in whatever
       form it wrote it; replacing text or HTML with "HTTP 404" lost it. */
    if (!answer.response.ok) return body;
    throw unreadable(answer.response, message, error);
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

/**
 * An answer's status and headers, and its body read as `getResponseData`
 * reads it.
 *
 * @param answer - The answer, its body unread
 * @param responseType - What the body is read as
 * @param responseParser - Turns the body read into what the call resolves to
 * @param message - What an error answer that cannot be read says
 * @returns The status, the headers and the data
 * @example
 * ```ts
 * const { status, data } = await getResponse(answer, "json");
 * ```
 */
export async function getResponse(
  answer: Answer,
  responseType: ResponseType,
  responseParser?: ResponseParser,
  message?: string,
): Promise<{ status: number; headers: Headers; data: unknown }> {
  const data = await getResponseData(answer, responseType, responseParser, message);
  const { status, headers } = answer.response;
  return { status, headers, data };
}
