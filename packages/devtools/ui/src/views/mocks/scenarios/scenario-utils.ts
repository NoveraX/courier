import { GitBranch, Inbox, Layers, Shield, Shuffle, Timer, Zap } from "lucide-react";

import type { MockScenarioEntry } from "@/store/mock-slice";

export type ScenarioType = "error" | "latency" | "empty" | "auth" | "sequence" | "mixed" | "unknown";

export const SCENARIO_TYPE_META: Record<
  ScenarioType,
  { label: string; color: "rose" | "amber" | "sky" | "violet" | "indigo" | "secondary"; icon: React.ComponentType<{ className?: string }> }
> = {
  error:    { label: "Error",    color: "rose",      icon: Zap },
  latency:  { label: "Latency",  color: "amber",     icon: Timer },
  empty:    { label: "Empty",    color: "sky",       icon: Inbox },
  auth:     { label: "Auth",     color: "violet",    icon: Shield },
  sequence: { label: "Sequence", color: "indigo",    icon: Shuffle },
  mixed:    { label: "Mixed",    color: "amber",     icon: Layers },
  unknown:  { label: "Custom",   color: "secondary", icon: GitBranch },
};

export const SCENARIO_TYPE_STRIPE: Record<ScenarioType, string> = {
  error:    "bg-rose-500/60",
  latency:  "bg-amber-500/60",
  empty:    "bg-sky-500/60",
  auth:     "bg-violet-500/60",
  sequence: "bg-indigo-500/60",
  mixed:    "bg-amber-400/50",
  unknown:  "bg-border",
};

export const SCENARIO_TYPE_COVERAGE: Record<ScenarioType, string> = {
  error:    "bg-rose-500/50",
  latency:  "bg-amber-500/50",
  empty:    "bg-sky-500/50",
  auth:     "bg-violet-500/50",
  sequence: "bg-indigo-500/50",
  mixed:    "bg-amber-400/40",
  unknown:  "bg-muted-foreground/30",
};

/** Gradient background for the detail panel hero header */
export const SCENARIO_TYPE_GRADIENT: Record<ScenarioType, string> = {
  error:    "from-rose-500/12 to-transparent",
  latency:  "from-amber-500/12 to-transparent",
  empty:    "from-sky-500/12 to-transparent",
  auth:     "from-violet-500/12 to-transparent",
  sequence: "from-indigo-500/12 to-transparent",
  mixed:    "from-amber-400/10 to-transparent",
  unknown:  "from-muted-foreground/6 to-transparent",
};

/** Icon container bg + text color (combined classes) */
export const SCENARIO_TYPE_ICON_BG: Record<ScenarioType, string> = {
  error:    "bg-rose-500/12 text-rose-400",
  latency:  "bg-amber-500/12 text-amber-400",
  empty:    "bg-sky-500/12 text-sky-400",
  auth:     "bg-violet-500/12 text-violet-400",
  sequence: "bg-indigo-500/12 text-indigo-400",
  mixed:    "bg-amber-400/10 text-amber-400",
  unknown:  "bg-muted/60 text-muted-foreground/70",
};

/** Ring color for icon container */
export const SCENARIO_TYPE_RING: Record<ScenarioType, string> = {
  error:    "ring-rose-500/20",
  latency:  "ring-amber-500/20",
  empty:    "ring-sky-500/20",
  auth:     "ring-violet-500/20",
  sequence: "ring-indigo-500/20",
  mixed:    "ring-amber-400/15",
  unknown:  "ring-border-subtle",
};

/**
 * Derives a scenario's visual type from its endpoint behaviors.
 * Tags take precedence when present and unambiguous.
 */
export function deriveScenarioType(scenario: MockScenarioEntry): ScenarioType {
  // State machine scenarios: always "auth" regardless of endpoint behaviors
  if (scenario.hasStateMachine) return "auth";

  // Tag-based detection (fast path when server provides tags)
  const tags = scenario.tags ?? [];
  if (tags.includes("auth") || tags.includes("state-machine")) return "auth";
  if (tags.includes("sequence")) return "sequence";

  const behaviors = scenario.endpoints.map((e) => e.behavior);

  if (behaviors.length === 0) return "unknown";

  const hasSequence = behaviors.some((b) => b === "sequence");
  if (hasSequence) return "sequence";

  const allErrors  = behaviors.every((b) => b === "rejects");
  const hasErrors  = behaviors.some((b) => b === "rejects");
  const hasLatency = scenario.endpoints.some((e) => (e.latency ?? 0) > 200);
  const allResolveEmpty = behaviors.every((b) => b === "resolves" || b === "returns");

  if (allErrors) return "error";
  if (hasLatency && !hasErrors) return "latency";
  if (allResolveEmpty && !hasLatency) return "empty";
  if (hasErrors) return "mixed";
  if (hasLatency) return "mixed";

  return "unknown";
}

/** Coverage percentage: how many of the total server routes this scenario touches */
export function coveragePercent(endpointCount: number, totalRoutes: number): number {
  if (totalRoutes === 0) return 0;
  return Math.min(100, Math.round((endpointCount / totalRoutes) * 100));
}

