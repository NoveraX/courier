import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { parseJsonc } from "@/features/playground/jsonc-helpers";
import { getSocket } from "@/socket";

/**
 * Sends a message on the open WebSocket the Playground subscribed to: JSON
 * typed in, sent on Enter or with the button.
 *
 * @param props - The run whose channel takes the message
 * @returns The composer
 * @example
 * ```tsx
 * <WsComposer rid={entry.rid} />
 * ```
 */
export function WsComposer({ rid }: { rid: string }): React.ReactNode {
  const [text, setText] = useState("");
  const send = () => {
    if (text.trim() === "") return;
    const parsed = parseJsonc(text);
    if (!parsed.ok) {
      toast.error("The message is not valid JSON");
      return;
    }
    getSocket().emit("playground:write", { rid, data: parsed.value });
    setText("");
  };
  return (
    <div className="sticky bottom-0 flex items-center gap-2 border-t border-line bg-panel px-3.5 py-2.5">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          e.stopPropagation();
          send();
        }}
        aria-label="Message to send"
        placeholder='{ "type": "ping" }'
        className="h-8 min-w-0 flex-1 rounded-card border border-line bg-inset px-2.5 font-mono text-small text-fg outline-none placeholder:text-fg-subtle focus-visible:border-brand/60"
      />
      <button
        type="button"
        onClick={send}
        disabled={text.trim() === ""}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-card bg-brand px-3 text-control font-semibold text-bg disabled:cursor-default disabled:opacity-50"
      >
        <ArrowUpRight aria-hidden="true" className="size-3" />
        Send
      </button>
    </div>
  );
}
