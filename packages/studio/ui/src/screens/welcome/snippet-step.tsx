import { useState } from "react";

import { CodeLines } from "@/design/code/code-lines";
import type { SetupStep } from "@/features/welcome/frameworks-types";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

/* The lines a snippet asks the reader to add: the ones that name Studio. */
const ADDED_LINE = /courier|attachRuntime/i;

interface SnippetStepProps {
  step: SetupStep;
  /** `server` marks the file as server code. */
  side: "client" | "server";
  onCopied: () => void;
}

/**
 * A step that adds code: its variants as tabs, then the file it goes in and
 * the snippet, the lines that name Studio tinted.
 *
 * @param props - The step, which side it instruments, and who to tell once it is copied
 * @returns The snippet box
 * @example
 * ```tsx
 * <SnippetStep step={step} side="client" onCopied={() => markCopied(step.id)} />
 * ```
 */
export function SnippetStep({ step, side, onCopied }: SnippetStepProps): React.ReactNode {
  const [variant, setVariant] = useState(0);
  const shown = step.variants?.[variant];
  const code = shown?.code ?? step.code ?? "";
  const file = shown?.filePath ?? step.filePath ?? "";
  return (
    <>
      {step.variants && step.variants.length > 1 && (
        <div
          role="tablist"
          aria-label="Variant"
          className="scroll-row w-max max-w-full gap-1 rounded-card border border-line bg-inset p-0.75"
        >
          {step.variants.map((v, index) => (
            <button
              key={v.label}
              type="button"
              role="tab"
              aria-selected={index === variant}
              onClick={() => setVariant(index)}
              className={cn(
                "h-6.5 shrink-0 cursor-pointer rounded-md border px-2.75 text-small font-strong whitespace-nowrap transition-colors pointer-coarse:h-9",
                index === variant
                  ? "border-line bg-panel text-fg"
                  : "border-transparent text-fg-subtle hover:text-fg-muted",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-card border border-line bg-inset">
        <div className="flex h-8.5 items-center gap-2.5 border-b border-line pr-1.5 pl-3">
          <span
            aria-hidden="true"
            className={cn(
              "size-1.75 rounded-[2px] opacity-80",
              side === "server" ? "bg-warn" : "bg-brand",
            )}
          />
          <span className="font-mono text-label text-fg-muted">{file}</span>
          <span className="flex-1" />
          <CopyButton text={code} onCopied={onCopied} />
        </div>
        <CodeLines code={code} isHighlighted={(line) => ADDED_LINE.test(line)} />
      </div>
    </>
  );
}
