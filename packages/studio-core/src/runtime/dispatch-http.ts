import type { UploadProgress } from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import { type executeRequest, STUDIO_REQUEST_HEADER } from "@noverax/courier/internal";
import { playgroundRequestId } from "../lib/playground-request-id";
import { playgroundFailure } from "./playground-failure";
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

/** What runs a Playground call, and what stops it. */
export interface HttpRun {
  /** The executor, `executeRequest` */
  exec: typeof executeRequest;
  /** Aborts the call when the Playground cancels it: its request to the API, or to the app's proxy route */
  signal: AbortSignal;
}

/**
 * Run an HTTP endpoint for the Playground and send back what it answered.
 *
 * The answer keeps its own status and its headers. A failure keeps the body
 * it came with rather than a message lifted out of it, and variables the
 * schema refuses are reported with the 422 the proxy answers them with, not
 * as a server's 500, since nothing was sent.
 *
 * The call runs under `playgroundRequestId(rid)`, through the proxy as well,
 * so the request Studio shows for it is the Playground's own. A cancel
 * aborts it in either mode, and Studio shows that request as aborted.
 *
 * @param socket - The runtime's Studio socket, silent once the run is cancelled
 * @param payload - What the Playground asked to run
 * @param sources - The sources to run it against
 * @param run - The executor, and the signal that cancels the call
 * @example
 * ```ts
 * await dispatchHttp(told, payload, getSources(), { exec: executeRequest, signal: ac.signal });
 * ```
 */
export async function dispatchHttp(
  socket: ResponderSocket,
  payload: PlaygroundExecutePayload,
  sources: Sources,
  { exec, signal }: HttpRun,
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
  const chunk = await run(payload, sources, { exec, signal }, onUploadProgress);
  socket.emit("playground:chunk", { rid: payload.rid, chunk });
  socket.emit("playground:end", {
    rid: payload.rid,
    summary: { durationMs: performance.now() - startedAt },
  });
}

async function run(
  payload: PlaygroundExecutePayload,
  sources: Sources,
  { exec, signal }: HttpRun,
  onUploadProgress: ((progress: UploadProgress) => void) | undefined,
): Promise<HttpResultChunk> {
  const requestId = playgroundRequestId(payload.rid);
  try {
    const answer =
      payload.mode === "proxy"
        ? await callThroughProxy(sources, callOf(payload, requestId), true, {
            signal,
            ...(onUploadProgress && { onUploadProgress }),
          })
        : await exec(
            sources,
            {
              source: payload.source,
              group: payload.group,
              method: payload.method,
              variables: variablesOf(payload),
              options: {
                headers: payload.headers ?? {},
                rawData: true,
                signal,
                ...(onUploadProgress && { onUploadProgress }),
              },
            },
            { studioRequestId: requestId },
          );
    if (!isRawAnswer(answer)) return { kind: "http-result", status: 200, data: answer };
    const { status, headers, data } = answer;
    return { kind: "http-result", status, data, headers: Object.fromEntries(headers) };
  } catch (err) {
    return playgroundFailure(err, payload.mode === "proxy");
  }
}

/* What `rawData` resolves to: the answer with its status and headers. */
function isRawAnswer(value: unknown): value is { status: number; headers: Headers; data: unknown } {
  if (typeof value !== "object" || value === null) return false;
  if (!("status" in value) || !("headers" in value)) return false;
  return typeof value.status === "number" && value.headers instanceof Headers;
}

/* The proxy shows the call under the id its header names, and the call's
   pass, which lets it past `browsersOnly`, is issued for that id. */
function callOf(payload: PlaygroundExecutePayload, requestId: string): PlaygroundCall {
  return {
    source: payload.source,
    group: payload.group,
    method: payload.method,
    variables: variablesOf(payload),
    headers: { ...payload.headers, [STUDIO_REQUEST_HEADER]: requestId },
    requestId,
  };
}

/* A form is sent as the body; otherwise the variables are. */
function variablesOf(payload: PlaygroundExecutePayload): unknown {
  return payload.form ? formDataOf(payload.form) : (payload.variables ?? {});
}
