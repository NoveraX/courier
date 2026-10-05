import { setTimeout as sleep } from "node:timers/promises";
import { courier, defineGroup } from "@noverax/courier/define";
import { z } from "zod";

import { anyProduct } from "../catalog";
import { Deal, OrderEvent, SupportMessage } from "./schemas";
import { SUPPORT_GREETING, SUPPORT_REPLY_MS, supportAnswer } from "./support-desk";

const { stream, channel } = courier();

const DEAL_EVERY_MS = 4_000;
const DEAL_LASTS_MS = 5 * 60_000;

/**
 * What moves while a shopper watches: the shop's own stream of orders
 * changing status, and two the shop's server keeps itself — deals as they
 * start, and the support chat.
 */
export const live = defineGroup({
  prefix: "live",
  endpoints: {
    orders: stream.response(OrderEvent).get("orders"),
    deals: stream.response(Deal).implement(async function* (ctx) {
      while (!ctx.signal.aborted) {
        const { sku, name } = anyProduct();
        const percentOff = 5 * (1 + Math.floor(Math.random() * 8));
        const endsAt = new Date(Date.now() + DEAL_LASTS_MS).toISOString();
        yield { data: { sku, name, percentOff, endsAt } };
        await sleep(DEAL_EVERY_MS, undefined, { signal: ctx.signal }).catch(() => undefined);
      }
    }),
    support: channel
      .send(z.object({ text: z.string().min(1).max(500) }))
      .response(SupportMessage)
      .implement(() => ({
        onJoin(ctx) {
          ctx.send({ from: "support", text: SUPPORT_GREETING });
        },
        onMessage(ctx, message) {
          ctx.send({ from: "you", text: message.text });
          setTimeout(
            () => ctx.send({ from: "support", text: supportAnswer(message.text) }),
            SUPPORT_REPLY_MS,
          );
        },
      })),
  },
});
