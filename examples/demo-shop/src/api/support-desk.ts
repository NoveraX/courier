/* What the support desk's bot answers, by what the message is about. */
const ANSWERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/refund|money back/i, "Refunds go back to the card within five days. Which order is it?"],
  [
    /where|deliver|ship|track/i,
    "Orders ship within a day; live.orders follows each one as it moves.",
  ],
  [/cancel/i, "An order can be cancelled until it ships: orders.cancel does it."],
  [
    /stock|sold out|available/i,
    "Sold-out items come back within two weeks; cart.add says so in the meantime.",
  ],
];

const FALLBACK = "Thanks! A person reads this channel on weekdays; the bot answers the rest.";

/** How long the bot takes to answer, so a reply arrives after the message it answers. */
export const SUPPORT_REPLY_MS = 700;

/** The first line a shopper reads on joining the support chat. */
export const SUPPORT_GREETING = "Hi! Ask about an order, a delivery or a refund.";

/**
 * What the support desk's bot answers a shopper's message.
 *
 * @param text - What the shopper wrote
 * @returns The bot's answer
 * @example
 * ```ts
 * supportAnswer("Where is my order?"); // → "Orders ship within a day; …"
 * ```
 */
export function supportAnswer(text: string): string {
  return ANSWERS.find(([topic]) => topic.test(text))?.[1] ?? FALLBACK;
}
