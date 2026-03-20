import { useState } from "react";
import { CircleCheck, FileCode2 } from "lucide-react";
import { toast } from "sonner";

import type { SetupStep, CodeVariant } from "./frameworks";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/shared/code-block";

interface StepCardProps {
  step: SetupStep;
  index: number;
  isCompleted: boolean;
  isActive: boolean;
  onAction: () => void;
  onUndo?: () => void;
}

export function StepCard({
  step, index, isCompleted, isActive, onAction, onUndo,
}: StepCardProps): React.ReactElement {
  const Icon = step.icon;
  const [variantIdx, setVariantIdx] = useState(0);
  const activeVariant = step.variants?.[variantIdx];

  // Resolved code/filePath — variant takes priority over step-level
  const code = activeVariant?.code ?? step.code;
  const filePath = activeVariant?.filePath ?? step.filePath;
  const lang = activeVariant?.lang ?? step.lang ?? "ts";

  return (
    <div
      role={isCompleted && onUndo ? "button" : undefined}
      tabIndex={isCompleted && onUndo ? 0 : undefined}
      onClick={isCompleted && onUndo ? onUndo : undefined}
      onKeyDown={isCompleted && onUndo ? (e) => { if (e.key === "Enter") onUndo(); } : undefined}
      className={cn(
        "rounded-lg border p-4 transition-colors",
        isActive && "border-accent-brand/30 bg-accent-brand/5",
        isCompleted && onUndo && "cursor-pointer hover:border-border-strong",
        !isActive && "border-border bg-background",
      )}>
      <div className="flex gap-3">
        <div className="mt-0.5 shrink-0">
          <StepIndicator index={index} isCompleted={isCompleted} isActive={isActive} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <StepHeader step={step} isCompleted={isCompleted} isActive={isActive} />

              {isActive && step.variants && (
                <VariantTabs
                  variants={step.variants}
                  activeIdx={variantIdx}
                  onChange={setVariantIdx}
                />
              )}

              {isActive && code && (
                <div className="mt-3 space-y-1.5">
                  {filePath && <FilePathHint path={filePath} />}
                  <CodeBlock code={code} language={lang} />
                </div>
              )}

              {isActive && !step.autoComplete && (
                <Button className="mt-3" size="sm" onClick={() => {
                  if (code) {
                    navigator.clipboard.writeText(code);
                    toast.success("Copied to clipboard");
                  }
                  onAction();
                }}>
                  <Icon className="-ml-0.5 size-3.5 shrink-0" aria-hidden />
                  {step.actionLabel}
                </Button>
              )}

              {isActive && step.autoComplete && (
                <div className="mt-3 flex items-center gap-2 text-body-xs text-muted-foreground">
                  <span className="size-1.5 animate-pulse rounded-full bg-warning" />
                  {step.actionLabel}
                </div>
              )}
            </div>
            <Icon className={cn(
              "mt-0.5 size-4.5 shrink-0",
              isCompleted && "text-muted-foreground/30",
              isActive && "text-accent-brand",
              !isCompleted && !isActive && "text-muted-foreground/40",
            )} aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StepHeader({ step, isCompleted, isActive }: {
  step: SetupStep;
  isCompleted: boolean;
  isActive: boolean;
}): React.ReactElement {
  return (
    <>
      <p className={cn(
        "text-body-sm font-medium leading-6",
        isCompleted && "text-muted-foreground/50 line-through",
        isActive && "text-foreground",
        !isCompleted && !isActive && "text-muted-foreground",
      )}>
        {step.title}
      </p>
      <p className={cn(
        "mt-0.5 text-body-xs leading-5",
        isActive ? "text-muted-foreground" : "text-muted-foreground/60",
      )}>
        {step.description}
      </p>
    </>
  );
}

function VariantTabs({ variants, activeIdx, onChange }: {
  variants: CodeVariant[];
  activeIdx: number;
  onChange: (idx: number) => void;
}): React.ReactElement {
  return (
    <div className="mt-3 flex gap-1 rounded-lg bg-muted/50 p-0.5">
      {variants.map((v, i) => (
        <button
          key={v.label}
          type="button"
          onClick={() => onChange(i)}
          className={cn(
            "flex-1 rounded-md px-3 py-1 text-body-xs font-medium transition-colors",
            i === activeIdx
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

function FilePathHint({ path }: { path: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 text-body-xs text-muted-foreground/70">
      <FileCode2 className="size-3" />
      <code className="mono-sm">{path}</code>
    </div>
  );
}

function StepIndicator({ index, isCompleted, isActive }: {
  index: number;
  isCompleted: boolean;
  isActive: boolean;
}): React.ReactElement {
  if (isCompleted) {
    return (
      <div className="flex size-7 items-center justify-center">
        <CircleCheck className="size-7 text-success-foreground" />
      </div>
    );
  }
  return (
    <div className={cn(
      "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
      isActive ? "bg-accent-brand text-white" : "bg-muted text-muted-foreground",
    )}>
      {index + 1}
    </div>
  );
}
