import { Layers, Link2 } from "lucide-react";

import { SegmentedControl } from "@/components/shared/segmented-control";

import type { MiddlewareMode } from "./types";

// ── Props ──────────────────────────────────────────────────────────────────

interface ToolbarProps {
  mode: MiddlewareMode;
  middlewareCount: number;
  requestCount: number;
  onModeChange: (m: MiddlewareMode) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function Toolbar({
  mode,
  middlewareCount,
  requestCount,
  onModeChange,
}: ToolbarProps): React.ReactElement {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={onModeChange} />

      <div className="h-4 w-px bg-border-subtle" />

      <div className="ml-auto flex items-center gap-3 text-body-sm text-muted-foreground">
        <span className="flex items-center gap-1.5 tabular-nums">
          <Layers className="size-3 text-muted-foreground/50" />
          {middlewareCount} middleware
        </span>
        <span className="flex items-center gap-1.5 tabular-nums">
          <Link2 className="size-3 text-muted-foreground/50" />
          {requestCount} requests
        </span>
      </div>
    </div>
  );
}

// ── Mode options ───────────────────────────────────────────────────────────

const MODE_OPTIONS = [
  { value: "aggregate" as const, label: "Aggregate" },
  { value: "chain" as const, label: "Chain" },
];
