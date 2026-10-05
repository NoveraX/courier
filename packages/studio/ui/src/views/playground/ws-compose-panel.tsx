import { Send, SendHorizontal } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { parseJsonc, stripComments } from "@/features/playground/jsonc-helpers";
import { cn } from "@/lib/utils";
import { JsonEditor } from "./json-editor";

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

  const draft = useMemo(() => messageOf(value), [value]);
  const canSend = !disabled && draft !== undefined;

  const handleSend = useCallback(() => {
    if (disabled || draft === undefined) return;
    onSend(draft.message);
    setValue("{}");
  }, [disabled, draft, onSend]);

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

        <div className="absolute right-4.5 bottom-3.5">
          <button
            type="button"
            aria-label="Send message"
            aria-keyshortcuts={isMac ? "Meta+Enter" : "Control+Enter"}
            disabled={!canSend}
            onClick={handleSend}
            className={cn(
              "flex h-6 items-center justify-center gap-1 rounded-md px-2 transition-all duration-100",
              canSend
                ? "bg-accent-brand text-white hover:bg-accent-brand/90 active:scale-[0.97]"
                : "bg-muted/60 text-muted-foreground/40",
            )}
          >
            <SendHorizontal className="size-3" strokeWidth={2} aria-hidden="true" />
            <span aria-hidden="true" className="text-[10px] font-medium opacity-70">
              {isMac ? "⌘↵" : "⌃↵"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/* The message a draft holds; an empty one, or one that is not JSON, holds none. */
function messageOf(value: string): { message: unknown } | undefined {
  const stripped = stripComments(value).trim();
  if (stripped === "" || stripped === "{}") return undefined;
  const parsed = parseJsonc(stripped);
  return parsed.ok ? { message: parsed.value } : undefined;
}
