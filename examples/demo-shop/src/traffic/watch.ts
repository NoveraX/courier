import { setTimeout as sleep } from "node:timers/promises";

import { attempt } from "./attempt";
import { backend, storefront } from "./callers";
import { pickSome } from "./random";

const QUESTIONS = [
  "Where is my order?",
  "Can I cancel an order I placed this morning?",
  "When will the earbuds be back in stock?",
  "How long does a refund take?",
  "Do you ship to Norway?",
];

interface Subscription extends AsyncIterable<unknown> {
  close(): void;
}

/* Read a stream for a while, as a page open on it does, then leave. */
async function follow(subscription: Subscription, ms: number): Promise<number> {
  const timer = setTimeout(() => subscription.close(), ms);
  let seen = 0;
  try {
    for await (const _event of subscription) seen++;
  } finally {
    clearTimeout(timer);
    subscription.close();
  }
  return seen;
}

/**
 * Follow the shop's stream of orders for a while, as an order page does.
 *
 * @param ms - How long to follow it
 * @returns How many events arrived
 * @example
 * ```ts
 * await followOrders(20_000);
 * ```
 */
export function followOrders(ms: number): Promise<number> {
  return follow(storefront.live.orders(), ms);
}

/**
 * Follow the deals the shop's server streams for a while, as its home page does.
 *
 * @param ms - How long to follow them
 * @returns How many deals arrived
 * @example
 * ```ts
 * await followDeals(30_000);
 * ```
 */
export function followDeals(ms: number): Promise<number> {
  return follow(storefront.live.deals(), ms);
}

/**
 * Ask the support chat two questions, read the answers, and leave.
 *
 * @returns When the shopper has left the chat
 * @example
 * ```ts
 * await askSupport();
 * ```
 */
export async function askSupport(): Promise<void> {
  const chat = storefront.live.support();
  let answers = 0;
  chat.on("data", (message) => {
    if (message.from === "support") answers++;
  });
  try {
    for (const text of pickSome(QUESTIONS, 2)) {
      chat.send({ text });
      await sleep(2_000 + Math.random() * 2_000);
    }
    for (let waited = 0; answers < 3 && waited < 8; waited++) await sleep(1_000);
  } finally {
    chat.close();
  }
}

/**
 * What server code reads of the shop's account now and then: its key lasts
 * 45 s, so some of these find it expired and have it issued again.
 *
 * @returns When the account is read
 * @example
 * ```ts
 * await checkAccount();
 * ```
 */
export async function checkAccount(): Promise<void> {
  await attempt(() => backend.shop.account.me());
}
