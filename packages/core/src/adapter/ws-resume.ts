import type { LoggedEvent, TopicLog } from "../realtime/adapters";
import { encodeMessage } from "../realtime/ws/ws-protocol";
import { LIMITS } from "./limits";
import type { WSSocketContext } from "./ws-context";
import { askLog, wholeRange } from "./ws-log-reads";
import { resumableFrom } from "./ws-resume-position";
import type { TopicPosition } from "./ws-topic-sequences";

/**
 * What a subscription resuming from a log is not sent yet of its topic's
 * live frames: until the position it resumes to is known, none — each
 * counted by then is one the resumption sends, or one before what it owes;
 * then those after it, held until the resumption has sent what it missed.
 */
export interface ResumeGate {
  /** The position the subscription resumes to, once known */
  upTo: TopicPosition | undefined;
  /** The frames after it, in order */
  readonly held: string[];
  /** More came than are held: the subscription resumes nothing, and is sent the rest live */
  overflowed: boolean;
}

/**
 * Send a connection a frame of a topic's sequence, through the gate of its
 * subscription to the topic when that resumes from a log.
 *
 * @param ctx - The connection
 * @param topic - The qualified topic
 * @param position - The position the frame brings the count to
 * @param encoded - The frame
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
): void {
  const gate = ctx.resuming.size === 0 ? undefined : ctx.resuming.get(topic);
  if (!gate) {
    ctx.sendEncoded(encoded);
    return;
  }
  const { upTo } = gate;
  if (!upTo || (position.epoch === upTo.epoch && position.seq <= upTo.seq)) return;
  if (gate.held.length < LIMITS.WS_RESUME_HELD_FRAMES) {
    gate.held.push(encoded);
    return;
  }
  gate.overflowed = true;
  ctx.resuming.delete(topic);
  for (const frame of gate.held.splice(0)) ctx.sendEncoded(frame);
  ctx.sendEncoded(encoded);
}

/**
 * Send a subscription, once it is registered, what it missed since the
 * position it sent: at once, from the handler's history; or read from the
 * pub/sub adapter's log, which every replica shares, the topic's live
 * frames held meanwhile and sent after.
 *
 * @param ctx - The connection
 * @param topic - The qualified topic
 * @param since - The position the client sent, if any
 * @returns Whether all of it was sent
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
  const log = ctx.bridge?.log;
  if (log) return resumeFromLog(ctx, log, topic, since);
  const missed = since === undefined ? undefined : ctx.registry.eventsAfter(topic, since);
  for (const frame of missed ?? []) ctx.sendEncoded(frame);
  return missed !== undefined;
}

async function resumeFromLog(
  ctx: WSSocketContext,
  log: TopicLog,
  topic: string,
  since: unknown,
): Promise<boolean> {
  const gate: ResumeGate = { upTo: undefined, held: [], overflowed: false };
  ctx.resuming.set(topic, gate);
  try {
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
  } finally {
    if (ctx.resuming.get(topic) === gate) {
      ctx.resuming.delete(topic);
      for (const frame of gate.held) ctx.sendEncoded(frame);
    }
  }
}

/* The connection an event left out is sent `skip` for it, as it was live. */
function frameOf(topic: string, event: LoggedEvent, connectionId: string): string {
  const { seq, payload } = event;
  if (event.exclude === connectionId) return encodeMessage({ type: "skip", topic, seq });
  return encodeMessage({ type: "data", topic, payload, seq });
}
