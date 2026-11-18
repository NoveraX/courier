import { isString, isWait } from "../../realtime/ws/frame-fields";
import { isRecord } from "../../utils/is-record";
import { ownFields } from "../../utils/own";

/**
 * The version of the messages replicas pass each other for the HTTP
 * transport. A field a replica acts on, or what a signature covers, is a
 * new version, which a replica that does not speak it skips: the request
 * then goes unanswered, and its client is told its connection's holder is
 * out of reach and opens another.
 */
export const HTTP_FORWARD_VERSION = 1;
/** The longest message id taken, in characters. */
const MAX_ID_LENGTH = 64;
const REPLICA = /^[0-9a-f]{16}$/;

/**
 * The channel a replica hears, under the adapter's prefix, the transport's
 * requests other replicas send on to it and their holders' answers. No
 * topic takes this name: a topic names a source and an endpoint, with dots.
 *
 * @param replica - The replica's name, as its tokens carry it
 * @returns The channel
 * @example
 * ```ts
 * forwardChannel("3f9c0a7d51e2b864"); // "courier:ws:http:3f9c0a7d51e2b864"
 * ```
 */
export function forwardChannel(replica: string): string {
  return `courier:ws:http:${replica}`;
}

/** A request of the transport that reached a replica other than its connection's holder, sent on to it. */
export interface ForwardRequest {
  readonly v: typeof HTTP_FORWARD_VERSION;
  readonly kind: "request";
  /** Unique: the holder acts on one id once, and answers under it */
  readonly id: string;
  /** When it was sent, in milliseconds since the epoch: the holder acts on it only near that time */
  readonly at: number;
  /** The replica that sent it on, which waits for the answer on its own channel */
  readonly from: string;
  /** The longest the holder may hold a poll, in milliseconds */
  readonly wait: number;
  /** The request's body, as its client sent it */
  readonly request: string;
  /** With a cluster secret, the HMAC-SHA-256 of the rest and of the channel it travels on, in hex */
  readonly sig?: string | undefined;
}

/** The holder holds the poll it was sent, and answers once it ends. */
export interface ForwardTaken {
  readonly v: typeof HTTP_FORWARD_VERSION;
  readonly kind: "taken";
  readonly id: string;
  readonly sig?: string | undefined;
}

/** The holder's answer to a request sent on to it. */
export interface ForwardAnswer {
  readonly v: typeof HTTP_FORWARD_VERSION;
  readonly kind: "answer";
  readonly id: string;
  readonly status: number;
  /** The answer's body: a poll's events, or a refusal */
  readonly body: string;
  readonly sig?: string | undefined;
}

/** What replicas pass each other for the HTTP transport. */
export type ForwardMessage = ForwardRequest | ForwardTaken | ForwardAnswer;

/** A message read; one of another version, skipped; or why it is no message. */
export type ReadForward =
  | { readonly message: ForwardMessage }
  | { readonly skipped: "version" }
  | { readonly malformed: string };

/**
 * Read what arrived on a replica's forwarding channel, whoever sent it:
 * every field checked, and only those a reader acts on kept, so the
 * signature is checked over what is acted on. Reading never throws.
 *
 * @param raw - The payload as the adapter delivered it
 * @returns The message, or why it is set aside
 * @example
 * ```ts
 * const read = readForwardMessage(raw);
 * if ("message" in read && read.message.kind === "answer") settle(read.message);
 * ```
 */
export function readForwardMessage(raw: unknown): ReadForward {
  if (!isRecord(raw)) return { malformed: "a forwarded message is an object" };
  const { v, kind, id, sig, ...rest } = ownFields(raw);
  if (typeof v === "number" && v !== HTTP_FORWARD_VERSION) return { skipped: "version" };
  if (v !== HTTP_FORWARD_VERSION) return { malformed: "a forwarded message names its version" };
  if (!isString(id) || id.length === 0 || id.length > MAX_ID_LENGTH) {
    return { malformed: `a forwarded message has an id of 1 to ${MAX_ID_LENGTH} characters` };
  }
  if (sig !== undefined && !isString(sig)) return { malformed: "a signature is a string" };
  const signed = sig === undefined ? {} : { sig };
  const { at, from, wait, request, status, body } = rest;
  switch (kind) {
    case "request":
      if (!isWait(at) || !isReplica(from) || !isWait(wait) || !isString(request)) break;
      return { message: { v, kind, id, at, from, wait, request, ...signed } };
    case "taken":
      return { message: { v, kind, id, ...signed } };
    case "answer":
      if (!isStatus(status) || !isString(body)) break;
      return { message: { v, kind, id, status, body, ...signed } };
  }
  return { malformed: `a forwarded message of kind ${String(kind)} is not one` };
}

function isReplica(value: unknown): value is string {
  return isString(value) && REPLICA.test(value);
}

function isStatus(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 200 && (value as number) <= 599;
}
