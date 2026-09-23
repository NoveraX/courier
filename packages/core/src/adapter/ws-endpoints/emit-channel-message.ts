import type { WSSocketContext } from "../ws-context";

/** Emit a studio stream message event for a channel send/broadcast */
export function emitChannelMessage(
  ctx: WSSocketContext,
  topic: string,
  data: unknown,
  eventType: string,
): void {
  if (!ctx.dt.onStreamMessage) return;
  const sub = ctx.subscriptionIds.get(topic);
  const seq = sub ? ++sub.seq.value : ++ctx.seq.value;
  const json = typeof data === "string" ? data : JSON.stringify(data);
  ctx.dt.onStreamMessage({
    requestId: sub?.requestId ?? ctx.requestId,
    seq,
    eventType,
    dataSize: json.length,
    dataPreview: json.length <= 512 ? json : `${json.slice(0, 512)}…`,
    timestamp: Date.now(),
  });
}
