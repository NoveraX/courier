import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { TourStep } from "./tour-steps";

const GAP = 14;
const TOOLTIP_W = 300;
const TOOLTIP_H_ESTIMATE = 180;
const VIEWPORT_PAD = 12;

interface TourTooltipProps {
  step: TourStep;
  rect: DOMRect;
  current: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

export function TourTooltip({
  step,
  rect,
  current,
  total,
  onNext,
  onPrev,
  onSkip,
}: TourTooltipProps): React.ReactElement {
  const style = useMemo(() => computePosition(step.placement, rect), [step.placement, rect]);
  const isLast = current === total - 1;

  return (
    <motion.div
      key={current}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.15 }}
      className="fixed z-91 w-75 rounded-xl border border-border bg-card p-4 shadow-xl shadow-black/40"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h4 className="text-h4 text-foreground">{step.title}</h4>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close tour"
          className="size-6 shrink-0"
          onClick={onSkip}
        >
          <X className="size-3" />
        </Button>
      </div>

      <p className="mb-4 text-body-sm leading-relaxed text-muted-foreground">{step.description}</p>

      <div className="flex items-center justify-between">
        <span className="text-xs tabular-nums text-muted-foreground/60">
          {current + 1}/{total}
        </span>
        <div className="flex gap-1.5">
          {current > 0 && (
            <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onPrev}>
              <ChevronLeft className="size-3" />
              Back
            </Button>
          )}
          <Button size="sm" className="h-7 gap-1 px-3 text-xs" onClick={onNext}>
            {isLast ? "Done" : "Next"}
            {!isLast && <ChevronRight className="size-3" />}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

/** Compute tooltip position with viewport clamping. */
function computePosition(
  placement: TourStep["placement"],
  rect: DOMRect,
): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left: number;
  let top: number;

  switch (placement) {
    case "right":
      left = rect.right + GAP;
      top = rect.top;
      break;
    case "left":
      left = rect.left - TOOLTIP_W - GAP;
      top = rect.top;
      break;
    case "bottom":
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
      top = rect.bottom + GAP;
      break;
    case "top":
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
      top = rect.top - TOOLTIP_H_ESTIMATE - GAP;
      break;
  }

  // Clamp within viewport
  left = Math.max(VIEWPORT_PAD, Math.min(left, vw - TOOLTIP_W - VIEWPORT_PAD));
  top = Math.max(VIEWPORT_PAD, Math.min(top, vh - TOOLTIP_H_ESTIMATE - VIEWPORT_PAD));

  return { left, top };
}
