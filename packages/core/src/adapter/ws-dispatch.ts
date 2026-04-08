/**
 * WS dispatch entry point.
 *
 * Public surface for inbound WS message handlers consumed by
 * `ws-lifecycle.ts` and the test suite. Implementation lives in siblings:
 *
 * - `ws-subscribe.ts`        — handleSubscribe + authorize flow
 * - `ws-message.ts`          — handleMessage + handleUnsubscribe
 * - `ws-dispatch-helpers.ts` — extractHeaders, closeSubscriptionEntry
 */

export { handleMessage, handleUnsubscribe } from "./ws-message";
export { handleSubscribe } from "./ws-subscribe";
