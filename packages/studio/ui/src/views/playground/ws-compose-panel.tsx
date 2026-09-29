import { Send, SendHorizontal } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { JsonEditor, stripComments } from "./json-editor";

// ── Types ────────────────────────────────────────────────────────────────────

interface WSComposePanelProps {
  disabled: boolean;
  onSend: (data: unknown) => void;
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

/** Compose panel for sending JSON messages to an active WS channel */
export function WSComposePanel({
  disabled,
  onSend,
  className,
}: WSComposePanelProps): React.ReactElement {
  const [value, setValue] = useState("{}");
  const isMac = useRef(navigator.platform?.includes("Mac")).current;

  const isValid = isValidJsonc(value);
  const canSend = !disabled && value.trim() !== "" && value.trim() !== "{}" && isValid;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const stripped = stripComments(value).trim();
    if (!stripped || stripped === "{}") return;
    try {
      onSend(JSON.parse(stripped));
      setValue("{}");
    } catch {
      /* skip */
    }
  }, [value, canSend, onSend]);

  return (
    <div className={cn("flex flex-col border-t border-border-subtle", className)}>
      {/* ── Header ── */}
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
        <Send className="size-3 text-muted-foreground" />
        <span className="text-caption text-muted-foreground">Message</span>
      </div>

      {/* ── Editor + Send ── */}
      <div className="relative px-3 pb-2">
        <JsonEditor
          value={value}
          onChange={setValue}
          onSubmit={handleSend}
          placeholder="{}"
          className="h-20"
        />

        {/* Send button */}
        <div className="absolute right-4.5 bottom-3.5">
          <button
            type="button"
            disabled={!canSend}
            onClick={handleSend}
            className={cn(
              "flex h-6 items-center justify-center gap-1 rounded-md px-2 transition-all duration-100",
              canSend
                ? "bg-accent-brand text-white hover:bg-accent-brand/90 active:scale-[0.97]"
                : "bg-muted/60 text-muted-foreground/40",
            )}
          >
            <SendHorizontal className="size-3" strokeWidth={2} />
            <span className="text-[10px] font-medium opacity-70">{isMac ? "⌘↵" : "⌃↵"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidJsonc(str: string): boolean {
  try {
    JSON.parse(stripComments(str));
    return true;
  } catch {
    return false;
  }
}
