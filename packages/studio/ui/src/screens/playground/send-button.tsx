import type { LucideIcon } from "lucide-react";
import { CornerDownLeft, Loader, Radio, Send, Square, Wifi } from "lucide-react";

import { isApplePlatform } from "@/lib/apple-platform";

import { cn } from "@/lib/utils";

/** What the primary button does now. */
export type SendAction = "send" | "sending" | "subscribe" | "unsubscribe";

const LOOK: Readonly<Record<SendAction, { label: string; className: string }>> = {
  send: { label: "Send", className: "bg-brand text-bg hover:bg-brand/90" },
  sending: { label: "Sending", className: "bg-raised text-fg-muted" },
  subscribe: { label: "Subscribe", className: "bg-brand text-bg hover:bg-brand/90" },
  unsubscribe: { label: "Unsubscribe", className: "bg-err text-white hover:bg-err/90" },
};

interface SendButtonProps {
  action: SendAction;
  /** A WebSocket subscribes with its own icon. */
  transport: "http" | "sse" | "ws";
  disabled?: boolean | undefined;
  onClick: () => void;
}

/**
 * The Playground's primary button: Send, then Sending while a call is in
 * flight; Subscribe for a stream, Unsubscribe while it is open. ⌘↵ —
 * Ctrl+Enter off a Mac — does what it says, which the button shows where
 * there is a keyboard to press it on.
 *
 * @param props - What it does now, the endpoint's transport, and what a click does
 * @returns The button
 * @example
 * ```tsx
 * <SendButton action="send" transport="http" onClick={send} />
 * ```
 */
export function SendButton({
  action,
  transport,
  disabled,
  onClick,
}: SendButtonProps): React.ReactNode {
  const look = LOOK[action];
  const icons: Readonly<Record<SendAction, LucideIcon>> = {
    send: Send,
    sending: Loader,
    subscribe: transport === "ws" ? Wifi : Radio,
    unsubscribe: Square,
  };
  const Icon = icons[action];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || action === "sending"}
      aria-keyshortcuts="Meta+Enter Control+Enter"
      className={cn(
        "flex h-8.5 shrink-0 cursor-pointer items-center gap-2 rounded-[9px] pr-3.5 pl-3 text-ui font-semibold whitespace-nowrap shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default max-sm:ml-auto pointer-coarse:h-9",
        look.className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-3.75", action === "sending" && "animate-spin")}
      />
      {look.label}
      {action !== "sending" && (
        <span aria-hidden="true" className="ml-1 flex items-center gap-0.5 pointer-coarse:hidden">
          <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-chip bg-current/16 px-1 text-badge leading-none font-semibold">
            {isApplePlatform() ? "⌘" : "Ctrl"}
          </span>
          <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-chip bg-current/16 px-1">
            <CornerDownLeft className="size-2.75" />
          </span>
        </span>
      )}
    </button>
  );
}
