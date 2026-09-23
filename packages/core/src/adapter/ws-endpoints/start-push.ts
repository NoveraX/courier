import { createLogger } from "../../logger";
import type { WSContext, WSPushHandler } from "../../realtime/types";
import { abortableEvents } from "../../utils/abortable-events";
import type { WSSocketContext } from "../ws-context";
import { emitChannelMessage } from "./emit-channel-message";

const log = createLogger("WS");

/**
 * Start a push-only async generator subscription (server → client).
 * Iterates the endpoint's async generator and sends each yielded value
 * as a data message to the client. Registers subscription in topicManager.
 *
 * @param ctx - Per-connection socket context
 * @param topic - Qualified topic string (e.g. "api.chat.feed#abc")
 * @param endpoint - Push endpoint function (async generator factory)
 * @param variables - Validated subscription variables
 */
export function startPush(
  ctx: WSSocketContext,
  topic: string,
  endpoint: unknown,
  variables: unknown,
): void {
  const handler = endpoint as WSPushHandler<unknown, unknown>;
  const ended = new AbortController();
  const wsCtx: WSContext = {
    topic,
    variables,
    connectionId: ctx.connectionId,
    meta: ctx.meta,
    signal: ended.signal,
  };

  let generator: AsyncGenerator<unknown>;
  try {
    generator = handler(wsCtx);
  } catch (error) {
    log.warn("Push handler init failed", error);
    ctx.sendMessage({
      type: "error",
      topic,
      error: { code: 5000, message: "Subscription failed" },
    });
    return;
  }

  /* A generator waiting on an event that never came kept its timers and
     upstream subscriptions after the client left: cancelling only set a flag
     read after the next yield. The wait now ends when the subscription does,
     and the handler's signal fires. */
  const iterate = async (): Promise<void> => {
    try {
      for await (const value of abortableEvents(generator, ended.signal)) {
        ctx.seq.value++;
        ctx.sendMessage({ type: "data", topic, payload: value, seq: ctx.seq.value });
        emitChannelMessage(ctx, topic, value, "data");
      }
    } catch (error) {
      log.warn("Push generator failed", error);
      ctx.sendMessage({
        type: "error",
        topic,
        error: { code: 5000, message: "Subscription failed" },
      });
    }
  };

  ctx.topicManager.subscribe(ctx.connectionId, {
    topic,
    cleanup: () => ended.abort(),
  });

  iterate()
    .catch((err) => log.warn("Push generator failed", err))
    .finally(() => void ctx.topicManager.unsubscribe(ctx.connectionId, topic));
}
