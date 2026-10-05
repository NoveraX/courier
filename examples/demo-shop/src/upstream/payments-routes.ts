import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { Charge, Refund } from "../api/schemas";
import { BoundedMap } from "./bounded-map";
import { type Answer, chance, latency, NOT_FOUND, type UpstreamRequest } from "./http";

/** The secret key the shop's server holds. */
const SECRET_KEY = "Bearer sk_demo_shop";

const ChargeInput = z.object({ orderId: z.string().min(1), amount: z.number().min(0) });
const RefundInput = z.object({ chargeId: z.string().min(1) });

const charges = new BoundedMap<string, Charge>(500);
const refunds = new BoundedMap<string, Refund>(500);

/**
 * The payments provider's backend: charges that take their time and now and
 * then fail — the card network does not answer, or the card is declined —
 * and refunds of a charge once.
 *
 * @param req - The request
 * @returns The answer
 * @example
 * ```ts
 * await answerPayments(request); // POST /charges { orderId, amount } → [201, charge]
 * ```
 */
export async function answerPayments(req: UpstreamRequest): Promise<Answer> {
  if (req.headers.authorization !== SECRET_KEY) return [401, { message: "Unknown secret key" }];
  const [collection, id] = req.parts;
  if (collection === "charges" && req.method === "POST" && !id) return charge(req.body);
  if (collection === "charges" && req.method === "GET" && id) {
    await latency(30, 80);
    const found = charges.get(id);
    return found ? [200, found] : [404, { message: `No charge ${id}` }];
  }
  if (collection === "refunds" && req.method === "POST" && !id) return refund(req.body);
  return NOT_FOUND;
}

async function charge(body: unknown): Promise<Answer> {
  await latency(300, 1_100);
  const input = ChargeInput.safeParse(body);
  if (!input.success) return [400, { message: "A charge needs an orderId and an amount" }];
  if (chance(0.08)) return [502, { message: "The card network did not answer" }];
  if (chance(0.1)) return [402, { message: "Card declined" }];
  const made: Charge = {
    id: `ch_${randomUUID().slice(0, 12)}`,
    orderId: input.data.orderId,
    amount: input.data.amount,
    currency: "EUR",
    status: "succeeded",
  };
  charges.set(made.id, made);
  return [201, made];
}

async function refund(body: unknown): Promise<Answer> {
  await latency(150, 400);
  const input = RefundInput.safeParse(body);
  if (!input.success) return [400, { message: "A refund needs the chargeId it gives back" }];
  const refunded = charges.get(input.data.chargeId);
  if (!refunded) return [404, { message: `No charge ${input.data.chargeId}` }];
  if (refunded.status === "refunded") return [409, { message: "The charge is refunded already" }];
  charges.set(refunded.id, { ...refunded, status: "refunded" });
  const made: Refund = {
    id: `re_${randomUUID().slice(0, 12)}`,
    chargeId: refunded.id,
    amount: refunded.amount,
  };
  refunds.set(made.id, made);
  return [201, made];
}
