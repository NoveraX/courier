/**
 * StepCard — single step in the welcome walkthrough.
 *
 * Renders the indicator, header, optional code block (with variant tabs),
 * and an action button. Sub-components live in `./step-card-parts`.
 */

import { useState } from "react";

import { CodeBlock } from "@/components/shared/code-block";
import { Button } from "@/components/ui/button";
import { buttonProps } from "@/lib/button-props";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { SetupStep } from "./frameworks";
import { FilePathHint, StepHeader, StepIndicator, VariantTabs } from "./step-card-parts";

interface StepCardProps {
  step: SetupStep;
  index: number;
  isCompleted: boolean;
  isActive: boolean;
  onAction: () => void;
  onUndo?: () => void;
}

export function StepCard({
  step,
  index,
  isCompleted,
  isActive,
  onAction,
  onUndo,
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
      {...(isCompleted && onUndo ? buttonProps(onUndo) : {})}
      className={cn(
        "rounded-lg border p-4 transition-colors",
        isActive && "border-accent-brand/30 bg-accent-brand/5",
        isCompleted && onUndo && "cursor-pointer hover:border-border-strong",
        !isActive && "border-border bg-background",
      )}
    >
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
                <Button
                  className="mt-3"
                  size="sm"
                  onClick={() => {
                    if (code) void copyToClipboard(code, "snippet");
                    onAction();
                  }}
                >
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
            <Icon
              className={cn(
                "mt-0.5 size-4.5 shrink-0",
                isCompleted && "text-muted-foreground/30",
                isActive && "text-accent-brand",
                !isCompleted && !isActive && "text-muted-foreground/40",
              )}
              aria-hidden
            />
          </div>
        </div>
      </div>
    </div>
  );
}
