import { Loader2, Send, Webhook } from "lucide-react";

import { useWebhookSendDialog } from "@/apis/use-webhook-send";
import { ChoiceMenu } from "@/design/choice-menu";
import { DialogFrame } from "@/design/dialog-frame";

const INPUT =
  "w-full rounded-card border border-line-strong bg-inset px-2.5 font-mono text-control text-fg outline-none placeholder:text-fg-subtle focus-visible:border-brand aria-invalid:border-err";

/**
 * Deliver a webhook to the app: the webhook, the route it goes to and the
 * event — one the Timeline shows, as it came or changed, or a new one —
 * signed by the app that defines the webhook, with its own secret, so the
 * app's handler takes it as its sender's. The delivery then shows in the
 * Timeline as every delivery does.
 *
 * @returns The dialog, open while a delivery is asked for
 * @example
 * ```tsx
 * <WebhookSendDialog />
 * ```
 */
export function WebhookSendDialog(): React.ReactNode {
  const dialog = useWebhookSendDialog();
  const { webhooks, webhook, to, text, invalid, sending, error } = dialog;
  const known = webhooks?.find((one) => one.name === webhook);
  const names = [...new Set([...(webhooks ?? []).map((one) => one.name), webhook])].filter(Boolean);
  const ready = known !== undefined && to !== "" && invalid === null && !sending;
  return (
    <DialogFrame
      open={dialog.open}
      onClose={dialog.close}
      keepOpen={sending}
      closable={!sending}
      title="Deliver a webhook"
      description="Signed by the app that defines it, with the webhook's own secret."
      icon={{ icon: Webhook, tone: "bg-brand-dim text-brand" }}
      width="w-170"
      footer={
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-panel-subtle px-5 py-3">
          <button
            type="button"
            disabled={sending}
            onClick={dialog.close}
            className="flex h-8 cursor-pointer items-center rounded-card border border-line px-3.5 text-control text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => void dialog.send()}
            className="flex h-8 cursor-pointer items-center gap-1.75 rounded-card bg-fg px-3.5 text-control font-semibold text-bg hover:bg-fg/90 disabled:cursor-default disabled:opacity-50"
          >
            {sending ? (
              <Loader2 aria-hidden="true" className="size-3.25 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="size-3.25" />
            )}
            {sending ? "Delivering…" : "Deliver"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <ChoiceMenu
            icon={Webhook}
            label="Webhook"
            choices={names.map((name) => ({ value: name, label: name }))}
            value={webhook}
            onChange={dialog.pick}
          />
          {known && (
            <span className="text-small text-fg-subtle">{`${known.scheme} signature · defined by ${known.apps.join(", ")}`}</span>
          )}
          {webhooks === null && !error && (
            <span className="flex items-center gap-1.5 text-small text-fg-subtle">
              <Loader2 aria-hidden="true" className="size-3 animate-spin" />
              Asking the attached apps…
            </span>
          )}
        </div>
        {webhooks !== null && !known && (
          <p
            role="status"
            className="m-0 rounded-panel bg-warn-dim px-3 py-2.5 text-control text-warn"
          >
            {webhook
              ? `No app attached to Studio defines the ${webhook} webhook now. `
              : "No app attached to Studio defines a webhook yet. "}
            Start the app with its runtime attached; an app that loads a route when it is first
            requested, as Next.js does in development, defines its webhooks once their routes have
            been requested.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="webhook-send-to" className="text-label text-fg-muted">
            Route
          </label>
          <input
            id="webhook-send-to"
            list="webhook-send-routes"
            aria-describedby="webhook-send-to-hint"
            className={`${INPUT} h-8`}
            placeholder="http://localhost:3000/api/webhooks/stripe"
            value={to}
            onChange={(event) => dialog.setTo(event.target.value)}
          />
          <datalist id="webhook-send-routes">
            {known?.routes.map((route) => (
              <option key={route} value={route} />
            ))}
          </datalist>
          <span id="webhook-send-to-hint" className="text-small text-fg-subtle">
            Where its deliveries came to, or an address on this machine.
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="webhook-send-body" className="text-label text-fg-muted">
            Event
          </label>
          <textarea
            id="webhook-send-body"
            rows={12}
            spellCheck={false}
            aria-invalid={invalid !== null}
            aria-describedby={invalid ? "webhook-send-body-problem" : undefined}
            className={`${INPUT} min-h-40 resize-y py-2 leading-[1.5]`}
            value={text}
            onChange={(event) => dialog.setText(event.target.value)}
          />
          {invalid && (
            <span id="webhook-send-body-problem" className="text-small text-err">
              {`Not JSON: ${invalid}`}
            </span>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="m-0 rounded-panel bg-err-dim px-3 py-2.5 text-control text-err"
          >
            {error}
          </p>
        )}
      </div>
    </DialogFrame>
  );
}
