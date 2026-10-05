import { WandSparkles } from "lucide-react";
import { useCallback, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isValidJsonc, parseJsonc, toggleComment } from "@/features/playground/jsonc-helpers";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { highlightJsonc } from "./jsonc-highlight";

interface JsonEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  onSubmit?: () => void;
}

export function JsonEditor({
  value,
  onChange,
  placeholder,
  className,
  onSubmit,
}: JsonEditorProps): React.ReactElement {
  const jsonIndent = useStudioStore((s) => s.settings.jsonIndent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /* An empty editor holds nothing to send, which is not an error. */
  const isValid = value.trim() === "" || isValidJsonc(value);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;

      // Cmd+Enter or Ctrl+Enter → submit
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && onSubmit) {
        e.preventDefault();
        e.stopPropagation();
        onSubmit();
        return;
      }

      // Cmd+/ or Ctrl+/ → toggle line comment
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        const { text, start, end } = toggleComment(value, ta.selectionStart, ta.selectionEnd);
        onChange(text);
        requestAnimationFrame(() => {
          ta.selectionStart = start;
          ta.selectionEnd = end;
        });
        return;
      }

      if (e.key !== "Tab") return;
      e.preventDefault();
      const { selectionStart: start, selectionEnd: end } = ta;

      if (e.shiftKey) {
        const before = value.slice(0, start);
        const lineStart = before.lastIndexOf("\n") + 1;
        if (value.slice(lineStart, lineStart + 2) === "  ") {
          const next = value.slice(0, lineStart) + value.slice(lineStart + 2);
          onChange(next);
          requestAnimationFrame(() => {
            ta.selectionStart = Math.max(start - 2, lineStart);
            ta.selectionEnd = Math.max(end - 2, lineStart);
          });
        }
      } else {
        const next = `${value.slice(0, start)}  ${value.slice(end)}`;
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = start + 2;
          ta.selectionEnd = start + 2;
        });
      }
    },
    [value, onChange, onSubmit],
  );

  /* Text that is not JSON has nothing to lay out, and stays as it is. */
  const handlePrettify = useCallback(() => {
    const parsed = parseJsonc(value);
    if (parsed.ok) onChange(JSON.stringify(parsed.value, null, jsonIndent));
  }, [value, onChange, jsonIndent]);

  return (
    <div className={cn("relative flex flex-col", className)}>
      {/* Highlight overlay */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 overflow-auto rounded-md border px-3 py-2",
          "font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all",
          isValid ? "border-border-subtle" : "border-rose-500/30",
        )}
      >
        {value ? (
          highlightJsonc(value)
        ) : (
          <span className="text-muted-foreground/30">{placeholder}</span>
        )}
      </div>

      {/* Transparent textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={!value ? placeholder : undefined}
        spellCheck={false}
        className={cn(
          "min-h-0 flex-1 resize-none rounded-md border bg-background-inset px-3 py-2",
          "font-mono text-[12px] leading-relaxed text-transparent caret-foreground",
          "placeholder:text-transparent",
          "focus:outline-none focus:ring-1 focus:ring-accent-brand/50",
          isValid ? "border-border-subtle" : "border-rose-500/30",
        )}
      />

      {/* Actions */}
      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
        {!isValid && value.trim() !== "{}" && (
          <span className="mr-1 text-[10px] text-rose-400/70">Invalid JSON</span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Prettify JSON"
              className="size-5 text-muted-foreground/40 hover:text-foreground"
              onClick={handlePrettify}
            >
              <WandSparkles className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Prettify</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
