import { createLogger } from "../../logger";
import { ConnectionError } from "../errors";

const log = createLogger("SSE");

const EVENT_STREAM = "text/event-stream";

/** A response the server refused, with what it said about it. */
export class SSEResponseError extends Error {
  constructor(
    readonly statusCode: number,
    readonly reason: string,
    readonly retryAfterMs: number | undefined,
  ) {
    super(`SSE connection failed: ${statusCode} ${reason}`);
    this.name = "SSEResponseError";
  }
}

/**
 * The event stream a successful response carries, or why it carries none.
 *
 * A route that answers 200 with something else — an SPA's `index.html`
 * fallback, a JSON endpoint — used to be parsed as events anyway. Nothing
 * came of it, the connection counted as one that delivered, and the client
 * reconnected forever without a word. As `EventSource` does, such a response
 * now fails the subscription: asking again would get the same answer.
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
 * What the server said when it refused: its JSON `message`, or the status text.
 *
 * @param response - A response whose status is not 2xx
 * @returns The refusal, with how long the server asked the client to wait
 */
export async function refusal(response: Response): Promise<SSEResponseError> {
  const retryAfter = Number(response.headers.get("Retry-After"));
  const retryAfterMs =
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined;
  const said = await messageOf(response);
  return new SSEResponseError(response.status, said ?? response.statusText, retryAfterMs);
}

async function messageOf(response: Response): Promise<string | undefined> {
  /* A proxy's HTML page or plain text carries no message; the status text serves. */
  if (!response.headers.get("Content-Type")?.includes("json")) {
    await response.body?.cancel();
    return undefined;
  }
  try {
    const body = (await response.json()) as { message?: unknown; error?: { message?: unknown } };
    if (typeof body.message === "string") return body.message;
    if (typeof body.error?.message === "string") return body.error.message;
  } catch (error) {
    log.warn("Could not read the refused SSE response", error);
  }
  return undefined;
}
