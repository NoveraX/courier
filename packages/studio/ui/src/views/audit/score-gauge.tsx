import { motion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

import { SCORE_THRESHOLDS } from "./constants";
import type { AuditResult } from "./types";

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const STROKE_WIDTH = 8;
const VIEW_SIZE = 140;
const MIN_VISIBLE_PERCENT = 2;

function getScoreThreshold(score: number) {
  return SCORE_THRESHOLDS.find((t) => score >= t.min) ?? SCORE_THRESHOLDS[2];
}

interface ScoreGaugeProps {
  result: AuditResult;
}

export function ScoreGauge({ result }: ScoreGaugeProps): React.ReactNode {
  const threshold = getScoreThreshold(result.score);
  const hasIssues = result.breakdown.error + result.breakdown.warning + result.breakdown.hint > 0;

  // Show at least a sliver when score is 0 but there are issues
  const visualScore = result.score === 0 && hasIssues
    ? MIN_VISIBLE_PERCENT
    : result.score;

  const springValue = useSpring(0, { stiffness: 80, damping: 20 });
  const offset = useTransform(
    springValue,
    (v: number) => CIRCUMFERENCE - (v / 100) * CIRCUMFERENCE,
  );

  useEffect(() => {
    springValue.set(visualScore);
  }, [visualScore, springValue]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: VIEW_SIZE, height: VIEW_SIZE }}>
        <svg
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
            className={threshold.stroke}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            style={{ strokeDashoffset: offset }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-display font-bold ${threshold.color}`}>
            {result.score}
          </span>
          <span className="text-caption text-muted-foreground">
            {threshold.label}
          </span>
        </div>
      </div>
    </div>
  );
}
