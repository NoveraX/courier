import { createLogger } from "../../logger";
import { ONCE } from "../../utils/own";
import { CLIENT_LIMITS } from "../client-limits";
import { ConnectionError } from "../errors";

const log = createLogger("SSE");

const EVENT_STREAM = "text/event-stream";

/** A response the server refused, with what it said about it. */
export class SSEResponseError extends Error {
  /**
   * @param statusCode - The response's status
   * @param reason - Its message, or the status text
   * @param retryAfterMs - How long the server asked the client to wait
   * @param issues - The schema's issues, when it refused invalid variables
   */
  constructor(
    readonly statusCode: number,
    readonly reason: string,
    readonly retryAfterMs: number | undefined,
    readonly issues: readonly unknown[] = [],
  ) {
    super(`SSE connection failed: ${statusCode} ${reason}`);
    this.name = "SSEResponseError";
  }
}

/**
 * The event stream a successful response carries, or why it carries none.
 *
 * A route that answers 200 with something else — an SPA's `index.html`
 * fallback, a JSON endpoint — fails the subscription, as `EventSource` does:
 * asking again would get the same answer, and parsed as events it would
 * count as a connection that delivered while the client reconnected forever
 * without a word.
 *
 * @param response - A response whose status is 2xx
 * @returns Its body, or the failure to end the subscription with
 * @example
 * ```ts
 * const body = eventStreamOf(response);
 * if (body instanceof ConnectionError) return body;
 * for await (const frame of parseSSEFrames(body)) handle(frame);
 * ```
 */
export function eventStreamOf(response: Response): ReadableStream<Uint8Array> | ConnectionError {
  const type = response.headers.get("Content-Type");
  const essence = type?.split(";")[0]?.trim().toLowerCase();
  if (essence === EVENT_STREAM && response.body) return response.body;
  const got = response.body ? (type ?? "no Content-Type") : "no content";
  return new ConnectionError(
    `SSE response is not an event stream: ${response.status} with ${got}`,
    response.status,
  );
}

/**
 * What the server said when it refused: its JSON `message`, or the status
 * text, and the schema's `issues` when it refused invalid variables, so an
 * SSE refusal lists them as a WebSocket or an HTTP one does. The body is
 * read no further than `SSE_REFUSAL_MAX_BYTES`, and not past the attempt:
 * one longer, or one still coming when the attempt is given up, says the
 * status text.
 *
 * @param response - A response whose status is not 2xx
 * @param signal - The attempt's, whose abort stops the read
 * @returns The refusal, with how long the server asked the client to wait
 * @example
 * ```ts
 * if (!response.ok) throw await refusal(response, connection.signal);
 * ```
 */
export async function refusal(response: Response, signal: AbortSignal): Promise<SSEResponseError> {
  const retryAfter = Number(response.headers.get("Retry-After"));
  const retryAfterMs =
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined;
  const said = await bodyOf(response, signal);
  return new SSEResponseError(
    response.status,
    said.message ?? response.statusText,
    retryAfterMs,
    said.issues,
  );
}

async function bodyOf(
  response: Response,
  signal: AbortSignal,
): Promise<{ message?: string; issues?: unknown[] }> {
  const { body } = response;
  /* A proxy's HTML page or plain text carries no message; the status text serves. */
  if (!response.headers.get("Content-Type")?.includes("json") || body === null) {
    await body?.cancel();
    return {};
  }
  try {
    const text = await textOf(body, signal);
    if (text === undefined) return {};
    return refusalOf(JSON.parse(text));
  } catch (error) {
    log.warn("Could not read the refused SSE response", error);
  }
  return {};
}

/* The message and issues a JSON refusal names, its own or its `error`'s, whatever the JSON holds. */
function refusalOf(said: unknown): { message?: string; issues?: unknown[] } {
  if (typeof said !== "object" || said === null) return {};
  const error = "error" in said && typeof said.error === "object" ? said.error : null;
  const message =
    "message" in said && typeof said.message === "string"
      ? said.message
      : error !== null && "message" in error && typeof error.message === "string"
        ? error.message
        : undefined;
  const issues: unknown = "issues" in said ? said.issues : undefined;
  return {
    ...(message !== undefined && { message }),
    ...(Array.isArray(issues) && { issues: issues as unknown[] }),
  };
}

/* The body as text, or nothing once it runs past its bound or the attempt ends: the rest is let go of. */
async function textOf(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<string | undefined> {
  const reader = body.getReader();
  const letGo = () => {
    reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", letGo, ONCE);
  if (signal.aborted) letGo();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      size += read.value.byteLength;
      if (size > CLIENT_LIMITS.SSE_REFUSAL_MAX_BYTES) {
        log.warn("A refused SSE response ran past 64 KiB: its status text serves");
        letGo();
        return undefined;
      }
      text += decoder.decode(read.value, { stream: true });
    }
    return signal.aborted ? undefined : text + decoder.decode();
  } finally {
    signal.removeEventListener("abort", letGo);
  }
}
