import type { WSMessage } from "../realtime/ws/ws-protocol";
import { generateRequestId } from "../studio";
import type { WSSocketContext } from "./ws-context";
import { closeSubscriptionEntry, extractHeaders } from "./ws-dispatch-helpers";
import { startChannel, startPush } from "./ws-endpoints";
import { runMiddleware, VALIDATION_FAILED, validateVariablesSafe } from "./ws-middleware";
import { resolveSubscribeTopic } from "./ws-resolve";

/**
 * Handle a "subscribe" message from a WS client.
 *
 * Full flow: validate topic → check limits → resolve endpoint → validate
 * variables → run middleware → authorize → start channel/push → send
 * "subscribed".
 *
 * The "subscribed" confirmation is sent AFTER channel/push initialization
 * to prevent a race where the client sends a message before onJoin completes.
 *
 * @param ctx - Per-connection socket context
 * @param msg - Decoded WS message with type "subscribe"
 */
export async function handleSubscribe(ctx: WSSocketContext, msg: WSMessage): Promise<void> {
  const topic = msg.topic;
  if (!topic) {
    ctx.sendMessage({ type: "error", id: msg.id, error: { code: 4400, message: "Missing topic" } });
    return;
  }

  // Reconnect dedup: tear down old subscription (+ close its stream entry)
  if (ctx.topicManager.has(ctx.connectionId, topic)) {
    await ctx.topicManager.unsubscribe(ctx.connectionId, topic);
    closeSubscriptionEntry(ctx, topic);
  }

  if (ctx.topicManager.topicCount(ctx.connectionId) >= ctx.maxSubscriptions) {
    ctx.sendMessage({
      type: "error",
      id: msg.id,
      error: { code: 4429, message: "Too many subscriptions" },
    });
    return;
  }

  const resolved = resolveSubscribeTopic(ctx, msg, topic);
  if (!resolved) return;

  const variables = await validateVariablesSafe(ctx, msg, resolved.schema);
  if (variables === VALIDATION_FAILED) return;

  try {
    await runMiddleware(ctx, resolved.source, resolved.group, resolved.method, variables);
  } catch {
    if (ctx.closed) return;
    ctx.sendMessage({
      type: "error",
      id: msg.id,
      error: { code: 5000, message: "Subscription failed" },
    });
    return;
  }
  if (ctx.closed) return;

  if (ctx.authorize && !(await authorizeSubscription(ctx, msg, resolved, topic, variables))) return;
  if (ctx.closed) return;

  // Set up per-subscription Studio tracking BEFORE channel/push init
  // so data emitted during onJoin is already tracked.
  //
  // Studio Playground proxy mode pre-allocates a requestId on the browser
  // side and forwards it via `?_playground_rid=<id>` on the upgrade URL.
  // Use it as the subscription requestId so events emitted by `dispatch`/
  // `instrumentSSE` correlate back to the playground tab. Production
  // browser connections never set this param and fall through to a fresh
  // server-generated id.
  const subRequestId = ctx.playgroundRequestId ?? generateRequestId();
  ctx.subscriptionIds.set(topic, {
    requestId: subRequestId,
    seq: { value: 0 },
    t0: performance.now(),
  });

  ctx.dt.onStreamOpen?.({
    requestId: subRequestId,
    source: resolved.source,
    group: resolved.group,
    method: resolved.method,
    transport: "ws",
    mode: "proxy",
    timestamp: Date.now(),
    requestHeaders: extractHeaders(ctx.request.headers),
  });

  try {
    if (resolved.schema.bidirectional === true || resolved.schema.receive) {
      await startChannel(ctx, topic, resolved.endpoint, variables);
    } else {
      startPush(ctx, topic, resolved.endpoint, variables);
    }
  } catch {
    // Rollback tracking on init failure
    closeSubscriptionEntry(ctx, topic);
    if (ctx.closed) return;
    ctx.sendMessage({
      type: "error",
      id: msg.id,
      error: { code: 5000, message: "Subscription failed" },
    });
    return;
  }
  if (ctx.closed) {
    closeSubscriptionEntry(ctx, topic);
    return;
  }

  // Send "subscribed" AFTER channel/push init to prevent race
  ctx.sendMessage({ type: "subscribed", id: msg.id, topic });
  ctx.dt.onWSTrack?.({ requestId: subRequestId, connectionId: ctx.connectionId, topic });
}

/**
 * Run authorization check for a subscription.
 * Wraps `ctx.authorize` in a timeout race; sends a 4403 error to the client on
 * rejection or failure and returns `false` so the caller can short-circuit.
 */
async function authorizeSubscription(
  ctx: WSSocketContext,
  msg: WSMessage,
  resolved: { source: string; group?: string; method: string },
  topic: string,
  variables: unknown,
): Promise<boolean> {
  const authorize = ctx.authorize;
  if (!authorize) return true;
  try {
    let authTimer: ReturnType<typeof setTimeout> | undefined;
    const allowed = await Promise.race([
      authorize({
        connectionId: ctx.connectionId,
        meta: ctx.meta,
        source: resolved.source,
        group: resolved.group,
        method: resolved.method,
        topic,
        variables,
      }),
      new Promise<never>((_, reject) => {
        authTimer = setTimeout(
          () => reject(new Error("Authorize timeout")),
          ctx.middlewareTimeoutMs,
        );
      }),
    ]);
    clearTimeout(authTimer);
    if (allowed === false) {
      ctx.sendMessage({
        type: "error",
        id: msg.id,
        error: { code: 4403, message: "Subscription rejected" },
      });
      return false;
    }
    return true;
  } catch {
    ctx.sendMessage({
      type: "error",
      id: msg.id,
      error: { code: 4403, message: "Subscription rejected" },
    });
    return false;
  }
}
