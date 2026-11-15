import type { LoggedEvent, TopicLog } from "../realtime/adapters";
import { encodeMessage } from "../realtime/ws/ws-protocol";
import type { FrameKind } from "./ws-backpressure";
import type { WSSocketContext } from "./ws-context";
import { askLog, wholeRange } from "./ws-log-reads";
import type { PubSubBridge } from "./ws-pubsub-bridge";
import { resumableFrom } from "./ws-resume-position";
import { WS_SERVER_LIMITS } from "./ws-server-limits";
import type { TopicPosition } from "./ws-topic-sequences";

/**
 * What a subscription opening on a replica of several is not sent yet of
 * its topic's live frames: until the position it starts from is known —
 * once the pub/sub adapter has taken the topic, and the log was read when
 * it keeps one — none: each counted by then is one the resumption sends, or
 * one before what it owes; then those after it, held until the resumption
 * has sent what it missed.
 */
export interface ResumeGate {
  /** The position the subscription resumes to, once known */
  upTo: TopicPosition | undefined;
  /** The frames after it, in order, each with its kind */
  readonly held: [encoded: string, kind: FrameKind][];
  /** More came than are held: the subscription resumes nothing, and is sent the rest live */
  overflowed: boolean;
}

/**
 * Send a connection a frame of a topic's sequence, through the gate of its
 * subscription to the topic while that opens on a replica of several.
 *
 * @param ctx - The connection
 * @param topic - The qualified topic
 * @param position - The position the frame brings the count to
 * @param encoded - The frame
 * @param kind - `control` for a `resync`, which a slow reader is sent all the same
 * @example
 * ```ts
 * sendTopicFrame(ctx, topic, { seq: 42, epoch: "k2m9x" }, frame);
 * ```
 */
export function sendTopicFrame(
  ctx: WSSocketContext,
  topic: string,
  position: TopicPosition,
  encoded: string,
  kind: FrameKind = "event",
): void {
  const gate = ctx.resuming.size === 0 ? undefined : ctx.resuming.get(topic);
  if (!gate) {
    ctx.sendEncoded(encoded, kind);
    return;
  }
  const { upTo } = gate;
  if (!upTo || (position.epoch === upTo.epoch && position.seq <= upTo.seq)) return;
  if (gate.held.length < WS_SERVER_LIMITS.RESUME_HELD_FRAMES) {
    gate.held.push([encoded, kind]);
    return;
  }
  gate.overflowed = true;
  ctx.resuming.delete(topic);
  for (const [frame, held] of gate.held.splice(0)) ctx.sendEncoded(frame, held);
  ctx.sendEncoded(encoded, kind);
}

/**
 * Send a subscription, once it is registered, what it missed since the
 * position it sent: at once, from the handler's history; or read from the
 * pub/sub adapter's log, which every replica shares, the topic's live
 * frames held meanwhile and sent after. On a replica with an adapter, it
 * first waits for the adapter to take the topic, so what another replica
 * publishes after the subscription is confirmed reaches it.
 *
 * @param ctx - The connection
 * @param topic - The qualified topic
 * @param since - The position the client sent, if any
 * @returns Whether all of it was kept and handed to the socket, which drops
 *   an event for a slow reader: `ctx.dropped` counts them
 * @example
 * ```ts
 * const recovered = await resumeSubscription(ctx, topic, msg.since);
 * ```
 */
export function resumeSubscription(
  ctx: WSSocketContext,
  topic: string,
  since: unknown,
): boolean | Promise<boolean> {
  const { bridge } = ctx;
  return bridge ? resumeOnceTaken(ctx, bridge, topic, since) : sendKept(ctx, topic, since);
}

/* What the handler's history kept since the position the client sent. */
function sendKept(ctx: WSSocketContext, topic: string, since: unknown): boolean {
  const missed = since === undefined ? undefined : ctx.registry.eventsAfter(topic, since);
  for (const frame of missed ?? []) ctx.sendEncoded(frame);
  return missed !== undefined;
}

async function resumeOnceTaken(
  ctx: WSSocketContext,
  bridge: PubSubBridge,
  topic: string,
  since: unknown,
): Promise<boolean> {
  const gate: ResumeGate = { upTo: undefined, held: [], overflowed: false };
  ctx.resuming.set(topic, gate);
  try {
    /* Until the adapter has taken the topic, what another replica publishes does not reach
       this one: the position is read after, and owes the subscription nothing before it. */
    await bridge.taken(topic);
    if (!ctx.topicManager.has(ctx.connectionId, topic)) return false;
    return bridge.log
      ? await resumeFromLog(ctx, bridge.log, topic, since, gate)
      : sendKept(ctx, topic, since);
  } finally {
    if (ctx.resuming.get(topic) === gate) {
      ctx.resuming.delete(topic);
      for (const [frame, kind] of gate.held) ctx.sendEncoded(frame, kind);
    }
  }
}

async function resumeFromLog(
  ctx: WSSocketContext,
  log: TopicLog,
  topic: string,
  since: unknown,
  gate: ResumeGate,
): Promise<boolean> {
  /* A replica that counts no event of the topic yet takes the log's count. */
  if (!ctx.registry.follows(topic)) {
    const position = await askLog(log.position(topic), ctx.refusals);
    if (position) ctx.registry.follow(topic, position);
  }
  const upTo = ctx.registry.positionOf(topic);
  gate.upTo = upTo;
  const from = resumableFrom(since);
  if (!from || from.epoch !== upTo.epoch || from.seq > upTo.seq) return false;
  const events =
    from.seq === upTo.seq ? [] : await askLog(log.read(topic, from, upTo.seq), ctx.refusals);
  if (!events || gate.overflowed || !wholeRange(events, from, upTo.seq)) return false;
  /* A subscription its client ended while the log was read is sent nothing of it. */
  if (!ctx.topicManager.has(ctx.connectionId, topic)) return false;
  for (const event of events) ctx.sendEncoded(frameOf(topic, event, ctx.connectionId));
  return true;
}

/* The connection an event left out is sent `skip` for it, as it was live. */
function frameOf(topic: string, event: LoggedEvent, connectionId: string): string {
  const { seq, payload } = event;
  if (event.exclude === connectionId) return encodeMessage({ type: "skip", topic, seq });
  return encodeMessage({ type: "data", topic, payload, seq });
}
