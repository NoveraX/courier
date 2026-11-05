import type { ScopedLogger } from "../../logger";
import { fromErrorCode, type RealtimeError } from "../errors";
import type { MachineEvent } from "./connection-machine-types";
import type { ConnectionRuntime } from "./connection-runtime";
import type { MessageQueue } from "./message-queue";
import type { FrameError, ServerFrame } from "./server-frame-types";
import { unqualifyTopic } from "./topic-key";
import { messageFrame } from "./topic-operations";
import { brokeOff, countEvent, restart, startAt } from "./topic-position";
import type { TopicRegistry } from "./topic-registry-types";
import type { Subscription } from "./topic-subscription";
import { encodeMessage } from "./ws-protocol";

const INTERNAL_ERROR = 5000;

/** What handling a server's frame works with. */
export interface MessageDispatchContext {
  readonly runtime: ConnectionRuntime;
  readonly topics: TopicRegistry;
  readonly queue: MessageQueue<Subscription>;
  readonly log: ScopedLogger;
  /** Whether the connection has credentials to send again when the server asks */
  readonly renewable: boolean;
}

/**
 * Act on one frame the server sent an admitted connection: answer its ping,
 * follow a subscription it confirmed, renamed, ended or failed, hand a
 * topic's data to the topic, take what it says about the connection's
 * credentials, and why it is closing the socket.
 *
 * @param ctx - The connection's state and subscriptions
 * @param frame - The frame, its fields checked
 */
export function dispatchIncomingMessage(ctx: MessageDispatchContext, frame: ServerFrame): void {
  switch (frame.type) {
    case "ping":
      ctx.runtime.send(encodeMessage({ type: "pong" }));
      return;
    case "auth_ok":
      if (renewalId(ctx) === frame.id) ctx.runtime.dispatch({ type: "renewed" });
      return;
    case "auth_error":
    case "disconnect":
      ctx.runtime.dispatch(closingWith(frame));
      return;
    case "reauth_required":
      if (ctx.renewable) ctx.runtime.dispatch({ type: "renewal-requested" });
      else ctx.log.warn("The server asked for credentials, and this connection has none to send");
      return;
    case "renamed":
      followRename(ctx, frame.topic, frame.to);
      return;
    case "subscribed":
      confirmSubscription(ctx, frame);
      return;
    case "complete":
      ctx.topics.end(frame.topic, failureOf(frame.error));
      return;
    case "data":
      if (frame.topic !== undefined && counts(ctx, frame.topic, frame.seq)) {
        ctx.topics.dispatch(frame.topic, frame.payload);
      }
      return;
    case "skip":
      counts(ctx, frame.topic, frame.seq);
      return;
    case "resync": {
      const s = ctx.topics.subscriptionOf(frame.topic);
      if (s !== undefined) restart(s, frame.position);
      return;
    }
    case "error":
      routeError(ctx, frame);
      return;
    default:
      return;
  }
}

/**
 * The server is closing the socket, and says why: the frame right before the
 * close carries its code, its reason and the wait the server asks for, and
 * gets through where a balancer loses the close itself.
 *
 * @param frame - `auth_error` before the connection is admitted or when its
 *   credentials are not renewed, `disconnect` after
 * @returns The event the connection's machine is told
 */
export function closingWith(
  frame: Extract<ServerFrame, { type: "auth_error" | "disconnect" }>,
): MachineEvent {
  const closure =
    frame.type === "auth_error"
      ? {
          code: frame.error.code,
          reason: frame.error.message,
          retryAfterMs: frame.retryAfterMs,
          version: frame.v,
        }
      : { code: frame.code, reason: frame.reason, retryAfterMs: frame.retryAfterMs };
  return { type: "closed", closure, announced: true };
}

/**
 * The server subscribed the connection under another topic than the one
 * asked for — a default or a transform in its variables schema changed what
 * the topic is qualified from. Everything about the subscription comes on
 * that topic, which is taken as the subscription's rather than dropped as
 * unknown.
 */
function followRename(ctx: MessageDispatchContext, topic: string, serverTopic: string): void {
  if (unqualifyTopic(serverTopic).baseTopic !== unqualifyTopic(topic).baseTopic) {
    ctx.log.warn(`Ignored a rename of ${topic} to another endpoint's topic`);
    return;
  }
  ctx.topics.rename(topic, serverTopic);
}

/**
 * The server is running the subscription: what was kept for it goes out, in
 * the order it was sent, and its subscribers hear it is open — and whether
 * it resumed. A confirmation nobody waits for is a subscription the client
 * left before the server set it up, which the server would otherwise keep
 * until the socket closes.
 */
function confirmSubscription(
  ctx: MessageDispatchContext,
  frame: Extract<ServerFrame, { type: "subscribed" }>,
): void {
  const confirmed = ctx.topics.confirm(frame.topic, frame.id);
  if (confirmed === undefined) {
    ctx.runtime.send(encodeMessage({ type: "unsubscribe", topic: frame.topic }));
    return;
  }
  if (confirmed === "stale") return;
  const resumed = startAt(confirmed, frame.position, frame.recovered);
  for (const message of ctx.queue.take(confirmed))
    ctx.runtime.send(messageFrame(confirmed.topic, message.payload));
  for (const subscriber of [...confirmed.subscribers]) subscriber.open?.({ resumed });
}

/*
 * Count an event, or a skip, in its subscription's position: false for one
 * counted already, which is not delivered again. Events that never came
 * between the last and this one break the sequence, as a resync does.
 */
function counts(ctx: MessageDispatchContext, topic: string, seq: number | undefined): boolean {
  const s = seq === undefined ? undefined : ctx.topics.subscriptionOf(topic);
  if (s === undefined || seq === undefined) return true;
  const from = (s.position?.seq ?? 0) + 1;
  const counted = countEvent(s, seq);
  if (counted === "gap") {
    ctx.log.warn(
      `Events ${from} to ${seq - 1} of ${s.topic} never came: what it holds may be stale`,
    );
    brokeOff(s);
  }
  return counted !== "counted";
}

/**
 * An error about a topic reaches its subscribers, not only the client's log;
 * one answering the credentials sent again — a frame the server could not
 * read, the socket left open — is about the connection. Any other error is
 * the connection's.
 */
function routeError(
  ctx: MessageDispatchContext,
  frame: Extract<ServerFrame, { type: "error" }>,
): void {
  const error = failureOf(frame.error) ?? fromErrorCode(INTERNAL_ERROR, "Unknown server error");
  if (frame.id !== undefined && frame.id === renewalId(ctx)) {
    ctx.log.warn(`The credentials sent again were not taken: ${error.message}`);
    ctx.runtime.dispatch({ type: "credentials-failed", error });
    return;
  }
  /* A subscribe refused outright — too many control frames in a second — will never be confirmed. */
  if (frame.id !== undefined && ctx.topics.refuse(frame.id, error)) return;
  if (frame.topic !== undefined && ctx.topics.subscriptionOf(frame.topic)) {
    ctx.topics.fail(frame.topic, error);
    return;
  }
  ctx.log.error(`Server error: ${error.message}`);
}

function renewalId(ctx: MessageDispatchContext): string | undefined {
  const { state } = ctx.runtime;
  return state.phase === "reauthenticating" ? state.authId : undefined;
}

function failureOf(error: FrameError | undefined): RealtimeError | undefined {
  return error && fromErrorCode(error.code, error.message, error.issues);
}
