import type { SubscriptionTracker, WSSocketContext } from "../ws-context";

/**
 * Tell Studio of what a subscription sends, as the event of its record: a
 * frame with no record counts on the connection.
 *
 * @param ctx - Per-connection socket context
 * @param record - Studio's record of the subscription that sent it
 * @param data - What was sent
 * @param eventType - The frame's type
 * @example
 * ```ts
 * emitChannelMessage(ctx, record, payload, "data");
 * ```
 */
export function emitChannelMessage(
  ctx: WSSocketContext,
  record: SubscriptionTracker | undefined,
  data: unknown,
  eventType: string,
): void {
  if (!ctx.dt.onStreamMessage) return;
  const seq = record ? ++record.seq.value : ++ctx.seq.value;
  const json = typeof data === "string" ? data : JSON.stringify(data);
  ctx.dt.onStreamMessage({
    requestId: record?.requestId ?? ctx.requestId,
    seq,
    eventType,
    dataSize: json.length,
    dataPreview: json.length <= 512 ? json : `${json.slice(0, 512)}…`,
    timestamp: Date.now(),
  });
}
