import type { StandardSchemaV1 } from "@standard-schema/spec";

import { createLogger } from "../../logger";
import { checkResponse } from "../../realtime/check-response";
import { describeFailure } from "../../realtime/describe-failure";
import { eventsOf } from "../../realtime/implementation";
import type { WSContext } from "../../realtime/types";
import { unqualifyTopic } from "../../realtime/ws/topic-key";
import { abortableEvents } from "../../utils/abortable-events";
import type { WSSocketContext } from "../ws-context";
import { closeSubscriptionEntry } from "../ws-dispatch-helpers";
import { sendSubscriptionEnd } from "../ws-subscription-end";
import type { AuthorizedSubscription, WSSubscriptionEntry } from "../ws-types";
import { emitChannelMessage } from "./emit-channel-message";
import { reportHandlerFailure } from "./report-handler-failure";

const log = createLogger("WS");

/**
 * Start a push-only async generator subscription (server → client).
 * Iterates the endpoint's async generator and sends each yielded value
 * as a data message to the client. Registers subscription in topicManager;
 * once its generator has finished, it lets go of that subscription alone,
 * not of one the client made to the same topic since.
 *
 * @param ctx - Per-connection socket context
 * @param topic - Qualified topic string (e.g. 'api.chat.feed#{"room":"a"}')
 * @param endpoint - Push endpoint function (async generator factory)
 * @param variables - Validated subscription variables
 * @param subscribeId - The id of the client's subscribe message, if any
 * @param responseSchema - The endpoint's response schema, which every value is held to
 * @param authorized - What the subscription was authorized as
 * @param resume - Sends what the subscription missed, once it is registered; whether it sent all of it
 * @returns Whether the subscription is still open: false when it was ended
 *   while what it missed was sent — the client left it, or subscribed again
 */
export async function startPush(
  ctx: WSSocketContext,
  topic: string,
  endpoint: unknown,
  variables: unknown,
  subscribeId?: string,
  responseSchema?: StandardSchemaV1,
  authorized?: AuthorizedSubscription,
  resume: () => boolean | Promise<boolean> = () => false,
): Promise<boolean> {
  const ended = new AbortController();
  let recovered = false;
  const wsCtx: WSContext = {
    topic,
    variables,
    connectionId: ctx.connectionId,
    get meta() {
      return ctx.meta;
    },
    signal: ended.signal,
    get recovered() {
      return recovered;
    },
  };

  let generator: AsyncIterable<unknown>;
  try {
    generator = eventsOf(endpoint, wsCtx, unqualifyTopic(topic).baseTopic);
  } catch (error) {
    /* Thrown on so the subscribe flow refuses the subscription; answering
       here as well left the client told both "failed" and "subscribed". */
    log.warn("Push handler init failed", error);
    throw error;
  }

  /* The wait ends when the subscription does, and the handler's signal
     fires, so a generator waiting on an event that never comes does not keep
     its timers and upstream subscriptions after the client left — a flag
     read after the next yield would never be read. */
  const iterate = async (): Promise<void> => {
    try {
      for await (const yielded of abortableEvents(generator, ended.signal)) {
        const value = responseSchema ? await checkResponse(responseSchema, yielded) : yielded;
        if (ended.signal.aborted) return;
        ctx.sendMessage({ type: "data", topic, payload: value });
        emitChannelMessage(ctx, topic, value, "data");
      }
      if (ended.signal.aborted) return;
      sendSubscriptionEnd(ctx, topic, subscribeId);
      closeSubscriptionEntry(ctx, topic, "complete");
    } catch (error) {
      reportHandlerFailure(ctx, topic, error, {
        refusal: "subscription ended",
        fault: "Push generator failed",
      });
      if (ended.signal.aborted) return;
      sendSubscriptionEnd(ctx, topic, subscribeId, describeFailure(error, "Subscription failed"));
      closeSubscriptionEntry(ctx, topic, "error");
    }
  };

  const entry: WSSubscriptionEntry = { topic, authorized, cleanup: () => ended.abort() };
  ctx.topicManager.subscribe(ctx.connectionId, entry);
  /* Registered first, then sent what it missed: a live event that comes meanwhile follows it. */
  recovered = await resume();

  /* Ended meanwhile, its generator is closed before it runs. */
  iterate()
    .catch((err: unknown) => log.warn("Push generator failed", err))
    .finally(() => void ctx.topicManager.release(ctx.connectionId, entry));
  return !ended.signal.aborted;
}
