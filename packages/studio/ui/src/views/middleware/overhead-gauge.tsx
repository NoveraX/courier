import { motion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";
import { getOverheadLevel } from "./compute-insights";
import type { OverheadLevel } from "./types";

// ── Config ─────────────────────────────────────────────────────────────────

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const STROKE_WIDTH = 8;
const VIEW_SIZE = 140;

const LEVEL_CONFIG: Record<OverheadLevel, { color: string; stroke: string; label: string }> = {
  good: { color: "text-emerald-400", stroke: "stroke-emerald-500", label: "Healthy" },
  warning: { color: "text-amber-400", stroke: "stroke-amber-500", label: "Elevated" },
  critical: { color: "text-rose-400", stroke: "stroke-rose-500", label: "Critical" },
};

// ── Props ──────────────────────────────────────────────────────────────────

interface OverheadGaugeProps {
  percent: number;
}

// ── Component ──────────────────────────────────────────────────────────────

export function OverheadGauge({ percent }: OverheadGaugeProps): React.ReactElement {
  const level = getOverheadLevel(percent);
  const cfg = LEVEL_CONFIG[level];

  // Map 0-100% overhead to gauge arc (cap at 100 visually)
  const visualPercent = Math.min(Math.max(percent, 0.5), 100);

  const springValue = useSpring(0, { stiffness: 80, damping: 20 });
  const offset = useTransform(
    springValue,
    (v: number) => CIRCUMFERENCE - (v / 100) * CIRCUMFERENCE,
  );

  useEffect(() => {
    springValue.set(visualPercent);
  }, [visualPercent, springValue]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: VIEW_SIZE, height: VIEW_SIZE }}>
        <svg
          aria-hidden="true"
          width={VIEW_SIZE}
          height={VIEW_SIZE}
          viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
          className="-rotate-90"
        >
          <circle
            cx={VIEW_SIZE / 2}
            cy={VIEW_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={STROKE_WIDTH}
          />
          <motion.circle
            cx={VIEW_SIZE / 2}
            cy={VIEW_SIZE / 2}
            r={RADIUS}
            fill="none"
            className={cfg.stroke}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            style={{ strokeDashoffset: offset }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-display font-bold tabular-nums", cfg.color)}>
            {percent.toFixed(1)}%
          </span>
          <span className="text-caption text-muted-foreground">{cfg.label}</span>
        </div>
      </div>
      <span className="text-caption text-muted-foreground/60">Middleware Overhead</span>
    </div>
  );
}
