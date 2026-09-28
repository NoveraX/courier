import type { UploadProgress } from "@noverax/courier";
import { type executeRequest, HTTPError, ValidationError } from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import { formDataOf } from "./playground-form";
import type { PlaygroundExecutePayload } from "./playground-payloads";
import type { ResponderSocket } from "./playground-responder";
import { callThroughProxy, type PlaygroundCall } from "./proxy-playground";

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
  const onUploadProgress = payload.form
    ? (progress: UploadProgress) =>
        socket.emit("playground:chunk", {
          rid: payload.rid,
          chunk: {
            kind: "upload-progress",
            loaded: progress.transferredBytes,
            total: progress.totalBytes,
            percentage: Math.round(progress.percent * 100),
          },
        })
    : undefined;
  const chunk = await run(payload, sources, exec, onUploadProgress);
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
  onUploadProgress: ((progress: UploadProgress) => void) | undefined,
): Promise<HttpResultChunk> {
  try {
    const answer =
      payload.mode === "proxy"
        ? await callThroughProxy(sources, callOf(payload), true, onUploadProgress)
        : await exec(sources, {
            source: payload.source,
            group: payload.group,
            method: payload.method,
            variables: variablesOf(payload),
            options: {
              headers: payload.headers ?? {},
              rawData: true,
              ...(onUploadProgress && { onUploadProgress }),
            },
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

function callOf(payload: PlaygroundExecutePayload): PlaygroundCall {
  return {
    source: payload.source,
    group: payload.group,
    method: payload.method,
    variables: variablesOf(payload),
    headers: payload.headers ?? {},
  };
}

/* A form is sent as the body; otherwise the variables are. */
function variablesOf(payload: PlaygroundExecutePayload): unknown {
  return payload.form ? formDataOf(payload.form) : (payload.variables ?? {});
}
