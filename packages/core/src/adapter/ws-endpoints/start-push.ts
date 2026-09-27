import type { StandardSchemaV1 } from "@standard-schema/spec";

import { createLogger } from "../../logger";
import { checkResponse } from "../../realtime/check-response";
import { describeFailure } from "../../realtime/describe-failure";
import type { WSContext, WSPushHandler } from "../../realtime/types";
import { abortableEvents } from "../../utils/abortable-events";
import type { WSSocketContext } from "../ws-context";
import { closeSubscriptionEntry } from "../ws-dispatch-helpers";
import { sendSubscriptionEnd } from "../ws-subscription-end";
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
 * @param subscribeId - The id of the client's subscribe message, if any
 * @param responseSchema - The endpoint's response schema, which every value is held to
 */
export function startPush(
  ctx: WSSocketContext,
  topic: string,
  endpoint: unknown,
  variables: unknown,
  subscribeId?: string,
  responseSchema?: StandardSchemaV1,
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
    /* Thrown on so the subscribe flow refuses the subscription; answering
       here as well left the client told both "failed" and "subscribed". */
    log.warn("Push handler init failed", error);
    throw error;
  }

  /* A generator waiting on an event that never came kept its timers and
     upstream subscriptions after the client left: cancelling only set a flag
     read after the next yield. The wait now ends when the subscription does,
     and the handler's signal fires. */
  const iterate = async (): Promise<void> => {
    try {
      for await (const yielded of abortableEvents(generator, ended.signal)) {
        const value = responseSchema ? await checkResponse(responseSchema, yielded) : yielded;
        if (ended.signal.aborted) return;
        ctx.seq.value++;
        ctx.sendMessage({ type: "data", topic, payload: value, seq: ctx.seq.value });
        emitChannelMessage(ctx, topic, value, "data");
      }
      if (ended.signal.aborted) return;
      sendSubscriptionEnd(ctx, topic, subscribeId);
      closeSubscriptionEntry(ctx, topic, "complete");
    } catch (error) {
      log.warn("Push generator failed", error);
      if (ended.signal.aborted) return;
      sendSubscriptionEnd(ctx, topic, subscribeId, describeFailure(error, "Subscription failed"));
      closeSubscriptionEntry(ctx, topic, "error");
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
