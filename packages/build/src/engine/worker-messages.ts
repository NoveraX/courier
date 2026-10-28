import { isRecord } from "../util/is-record";
import type { RoutesRequest } from "./routes-snapshot";
import type { WorkerReply } from "./worker-reply";

/* What marks the engine's own messages, apart from any a config sends on the same channel. */
const REQUEST_KIND = "courier-routes-request";
const REPLY_KIND = "courier-routes-reply";

/** The engine asking its process to read the routes. */
export interface RequestMessage {
  readonly kind: typeof REQUEST_KIND;
  readonly request: RoutesRequest;
}

/** The process answering the engine. */
export interface ReplyMessage {
  readonly kind: typeof REPLY_KIND;
  readonly reply: WorkerReply;
}

/**
 * The messages between the engine and the process that reads the routes,
 * marked and checked, so a message a config or a library sends on the same
 * channel — a readiness signal to a supervisor — is never taken for one.
 *
 * @example
 * ```ts
 * child.send(workerMessages.request(request));
 * child.on("message", (message) => {
 *   if (workerMessages.isReply(message)) settle(message.reply);
 * });
 * ```
 */
export const workerMessages = {
  request: (request: RoutesRequest): RequestMessage => ({ kind: REQUEST_KIND, request }),
  reply: (reply: WorkerReply): ReplyMessage => ({ kind: REPLY_KIND, reply }),
  isRequest: (message: unknown): message is RequestMessage =>
    isRecord(message) && message.kind === REQUEST_KIND && isRecord(message.request),
  isReply: (message: unknown): message is ReplyMessage =>
    isRecord(message) && message.kind === REPLY_KIND && isWorkerReply(message.reply),
} as const;

function isWorkerReply(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.ok === true) return isRecord(value.snapshot) && isRecord(value.snapshot.routes);
  return (
    value.ok === false &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    isRecord(value.context)
  );
}
