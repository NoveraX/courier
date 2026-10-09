import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  type AppWebhook,
  deliverAppWebhook,
  listAppWebhooks,
} from "@/features/webhooks/webhook-delivery";
import { closeWebhookSend, useWebhookSend } from "@/features/webhooks/webhook-send-store";

export interface UseWebhookSendReturn {
  open: boolean;
  /** The webhooks the attached apps define; `null` while Studio lists them. */
  webhooks: AppWebhook[] | null;
  webhook: string;
  to: string;
  /** The body as typed: JSON. */
  text: string;
  /** Why the body is not JSON, while it is not. */
  invalid: string | null;
  sending: boolean;
  error: string | null;
  pick: (webhook: string) => void;
  setTo: (to: string) => void;
  setText: (text: string) => void;
  send: () => Promise<void>;
  close: () => void;
}

/**
 * The send dialog's state: the webhooks the attached apps define, the one
 * picked and the route it goes to — the delivery's own, or the newest its
 * deliveries came to — the body as typed, and the delivery, which the app
 * that defines the webhook signs and sends.
 *
 * @returns The state and what changes it
 * @example
 * ```ts
 * const send = useWebhookSend();
 * await send.send();
 * ```
 */
export function useWebhookSendDialog(): UseWebhookSendReturn {
  const ask = useWebhookSend((s) => s.ask);
  const [webhooks, setWebhooks] = useState<AppWebhook[] | null>(null);
  const [webhook, setWebhook] = useState("");
  const [to, setTo] = useState("");
  const [text, setText] = useState("{}");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ask) return;
    let current = true;
    setWebhooks(null);
    setError(null);
    setWebhook(ask.webhook);
    setTo(ask.to);
    setText(JSON.stringify(ask.body, null, 2));
    const list = async () => {
      try {
        const listed = await listAppWebhooks();
        if (!current) return;
        setWebhooks(listed);
        const named = ask.webhook || (listed[0]?.name ?? "");
        setWebhook(named);
        if (ask.to === "") setTo(listed.find((one) => one.name === named)?.routes.at(-1) ?? "");
      } catch (failure) {
        if (current) setError(failure instanceof Error ? failure.message : String(failure));
      }
    };
    void list();
    return () => {
      current = false;
    };
  }, [ask]);

  const invalid = jsonProblem(text);
  const pick = (name: string) => {
    setWebhook(name);
    setTo(webhooks?.find((one) => one.name === name)?.routes.at(-1) ?? to);
  };
  const send = async () => {
    if (invalid !== null) return;
    setSending(true);
    setError(null);
    try {
      const { status } = await deliverAppWebhook({ webhook, to, body: JSON.parse(text) });
      toast.success(`Delivered ${webhook}: the app answered ${status}`);
      closeWebhookSend();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
    setSending(false);
  };
  return {
    open: ask !== null,
    webhooks,
    webhook,
    to,
    text,
    invalid,
    sending,
    error,
    pick,
    setTo,
    setText,
    send,
    close: closeWebhookSend,
  };
}

function jsonProblem(text: string): string | null {
  try {
    JSON.parse(text);
    return null;
  } catch (failure) {
    return failure instanceof Error ? failure.message : String(failure);
  }
}
