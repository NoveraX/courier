import { useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { writeClipboardText } from "@/lib/write-clipboard-text";

interface CopyButtonProps {
  text: string;
  /** Told once the text is on the clipboard. */
  onCopied?: (() => void) | undefined;
  className?: string | undefined;
}

/* How long the button says the text was copied. */
const COPIED_MS = 1500;

/**
 * Copies a command or snippet, and says so on itself for a moment; a copy
 * the browser refuses is said in an error toast.
 *
 * @param props - The text, and who to tell once it is copied
 * @returns The button
 * @example
 * ```tsx
 * <CopyButton text={command} onCopied={() => markCopied("install")} />
 * ```
 */
export function CopyButton({ text, onCopied, className }: CopyButtonProps): React.ReactNode {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try {
      await writeClipboardText(text);
    } catch (error) {
      console.warn("Copying the snippet failed", error);
      toast.error(error instanceof Error ? error.message : "Could not copy the snippet");
      return;
    }
    onCopied?.();
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_MS);
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={cn(
        "h-6 shrink-0 cursor-pointer rounded-md border border-line-strong bg-panel-subtle px-2.5 text-label font-strong text-fg-muted transition-colors hover:border-fg-subtle hover:text-fg",
        className,
      )}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
