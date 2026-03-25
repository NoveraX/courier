import { cn } from "@/lib/utils";
import type { HealthLevel } from "../types";

const LEVEL_STYLES: Record<HealthLevel, { dot: string; glow: string }> = {
  healthy: {
    dot: "bg-emerald-400",
    glow: "shadow-[0_0_6px_theme(colors.emerald.400/0.5)]",
  },
  degraded: {
    dot: "bg-amber-400",
    glow: "shadow-[0_0_6px_theme(colors.amber.400/0.5)]",
  },
  critical: {
    dot: "bg-rose-400",
    glow: "shadow-[0_0_6px_theme(colors.rose.400/0.5)]",
  },
  inactive: {
    dot: "bg-zinc-500",
    glow: "",
  },
};

interface HealthIndicatorProps {
  level: HealthLevel;
  pulse?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function HealthIndicator({
  level,
  pulse = false,
  size = "sm",
  className,
}: HealthIndicatorProps): React.ReactElement {
  const sizeClass = size === "sm" ? "size-2" : "size-2.5";
  const { dot, glow } = LEVEL_STYLES[level];
  const shouldPulse = pulse && level !== "inactive";

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {/* Pulse ring behind the dot */}
      {shouldPulse && (
        <span
          className={cn(
            "absolute inset-0 rounded-full animate-ping",
            dot,
            "opacity-40",
          )}
        />
      )}
      <span
        className={cn("inline-block rounded-full", sizeClass, dot, glow)}
        title={level}
        aria-label={`Health: ${level}`}
      />
    </span>
  );
}
