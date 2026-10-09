import { create } from "zustand";

/** A delivery to send: the webhook, the route it goes to, and the event. */
export interface WebhookSendAsk {
  webhook: string;
  to: string;
  body: unknown;
}

/**
 * The delivery the send dialog shows: the dialog is open while there is one.
 */
export const useWebhookSend = create<{ ask: WebhookSendAsk | null }>(() => ({ ask: null }));

/**
 * Open the send dialog on a delivery: one the Timeline shows, to deliver
 * again as it came or changed, or a new one, its webhook and route picked
 * in the dialog.
 *
 * @param ask - What the dialog starts from; a new delivery names none of it
 * @example
 * ```ts
 * openWebhookSend({ webhook: "stripe", to: request.url, body: request.variables });
 * ```
 */
export function openWebhookSend(ask: Partial<WebhookSendAsk> = {}): void {
  useWebhookSend.setState({
    ask: { webhook: ask.webhook ?? "", to: ask.to ?? "", body: ask.body ?? {} },
  });
}

/** Close the send dialog. */
export function closeWebhookSend(): void {
  useWebhookSend.setState({ ask: null });
}
