import type { ScopedLogger } from "../../logger";
import { fromErrorCode, type RealtimeError } from "../errors";
import type { MachineEvent } from "./connection-machine-types";
import type { ConnectionRuntime } from "./connection-runtime";
import type { MessageQueue } from "./message-queue";
import type { FrameError, ServerFrame } from "./server-frame-types";
import { unqualifyTopic } from "./topic-key";
import { messageFrame } from "./topic-operations";
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
      confirmSubscription(ctx, frame.topic, frame.id);
      return;
    case "complete":
      ctx.topics.end(frame.topic, failureOf(frame.error));
      return;
    case "data":
      if (frame.topic !== undefined) ctx.topics.dispatch(frame.topic, frame.payload);
      return;
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
 * the order it was sent, and its subscribers hear it is open. A confirmation
 * nobody waits for is a subscription the client left before the server set
 * it up, which the server would otherwise keep until the socket closes.
 */
function confirmSubscription(
  ctx: MessageDispatchContext,
  topic: string,
  id: string | undefined,
): void {
  const confirmed = ctx.topics.confirm(topic, id);
  if (confirmed === undefined) {
    ctx.runtime.send(encodeMessage({ type: "unsubscribe", topic }));
    return;
  }
  if (confirmed === "stale") return;
  for (const message of ctx.queue.take(confirmed))
    ctx.runtime.send(messageFrame(confirmed.topic, message.payload));
  for (const subscriber of [...confirmed.subscribers]) subscriber.open?.({ resumed: false });
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
