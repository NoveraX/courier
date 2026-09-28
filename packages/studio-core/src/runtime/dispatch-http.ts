import { type executeRequest, HTTPError, ValidationError } from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import type { PlaygroundExecutePayload } from "./playground-payloads";
import type { ResponderSocket } from "./playground-responder";

/** The one chunk an HTTP run answers the Playground with. */
export interface HttpResultChunk {
  kind: "http-result";
  status: number;
  data?: unknown;
  headers?: Record<string, string>;
  /** What went wrong, when the call failed; the answer's body stays in `data`. */
  error?: string;
}

/** The status Courier's proxy answers a refused schema with. */
const VALIDATION_FAILED = 422;

/**
 * Run an HTTP endpoint for the Playground and send back what it answered.
 *
 * The answer keeps its own status — a 201 was reported as 200 — and its
 * headers. A failure keeps the body it came with rather than a message
 * lifted out of it, and variables the schema refuses are reported with the
 * 422 the proxy answers them with, where they used to read as a server's 500
 * although nothing had been sent.
 *
 * @param socket - The runtime's Studio socket
 * @param payload - What the Playground asked to run
 * @param sources - The sources to run it against
 * @param exec - The executor, `executeRequest`
 * @example
 * ```ts
 * await dispatchHttp(socket, payload, getSources(), executeRequest);
 * ```
 */
export async function dispatchHttp(
  socket: ResponderSocket,
  payload: PlaygroundExecutePayload,
  sources: Sources,
  exec: typeof executeRequest,
): Promise<void> {
  const startedAt = performance.now();
  const chunk = await run(payload, sources, exec);
  socket.emit("playground:chunk", { rid: payload.rid, chunk });
  socket.emit("playground:end", {
    rid: payload.rid,
    summary: { durationMs: performance.now() - startedAt },
  });
}

async function run(
  payload: PlaygroundExecutePayload,
  sources: Sources,
  exec: typeof executeRequest,
): Promise<HttpResultChunk> {
  try {
    const answer = await exec(sources, {
      source: payload.source,
      group: payload.group,
      method: payload.method,
      variables: payload.variables ?? {},
      options: { headers: payload.headers ?? {}, rawData: true },
    });
    if (!isRawAnswer(answer)) return { kind: "http-result", status: 200, data: answer };
    const { status, headers, data } = answer;
    return { kind: "http-result", status, data, headers: Object.fromEntries(headers) };
  } catch (err) {
    return failure(err);
  }
}

function failure(err: unknown): HttpResultChunk {
  if (err instanceof ValidationError) {
    const { message, target, issues } = err;
    return {
      kind: "http-result",
      status: VALIDATION_FAILED,
      error: message,
      data: { success: false, message, target, issues },
    };
  }
  if (err instanceof HTTPError) {
    return {
      kind: "http-result",
      status: err.status,
      error: err.message,
      data: err.data,
      headers: Object.fromEntries(err.headers),
    };
  }
  return {
    kind: "http-result",
    status: 500,
    error: err instanceof Error ? err.message : "HTTP request failed",
  };
}

/* What `rawData` resolves to: the answer with its status and headers. */
function isRawAnswer(value: unknown): value is { status: number; headers: Headers; data: unknown } {
  if (typeof value !== "object" || value === null) return false;
  if (!("status" in value) || !("headers" in value)) return false;
  return typeof value.status === "number" && value.headers instanceof Headers;
}
