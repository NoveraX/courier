import { ChevronRight, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { buttonProps } from "@/lib/button-props";
import { cn } from "@/lib/utils";
import type { MockRouteEntry, RouteOverride } from "@/store/mock-slice";
import { SliderRow } from "./slider-row";

interface RouteOverrideRowProps {
  route: MockRouteEntry;
  override: RouteOverride;
  expanded: boolean;
  onToggleExpand: () => void;
  onOverrideChange: (o: RouteOverride) => void;
  onClear: () => void;
}

export function RouteOverrideRow({
  route,
  override,
  expanded,
  onToggleExpand,
  onOverrideChange,
  onClear,
}: RouteOverrideRowProps): React.ReactElement {
  return expanded ? (
    <div className="mx-3 my-1.5 overflow-hidden rounded-lg border border-border-subtle bg-card">
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/30"
        {...buttonProps(onToggleExpand)}
      >
        <MethodBadge method={route.httpMethod} />
        <span className="flex-1 truncate text-body-xs">
          <span className="font-mono text-foreground/70">
            {route.fullPath || route.path || `/${route.endpoint}`}
          </span>
          <span className="ml-1.5 text-muted-foreground/35">{route.endpoint}</span>
        </span>
        {override.enabled && <span className="size-1.5 shrink-0 rounded-full bg-accent-brand" />}
        <ChevronRight className="size-3 shrink-0 rotate-90 text-muted-foreground/30" />
      </div>

      <div className="space-y-3 border-t border-border-subtle px-3 py-3">
        <div className="flex h-8 items-center">
          <label className="flex items-center gap-2 text-body-xs text-muted-foreground/70">
            <Switch
              size="sm"
              checked={override.enabled}
              onCheckedChange={(checked) => onOverrideChange({ ...override, enabled: !!checked })}
            />
            Enable override
          </label>

          {override.enabled && (override.latency?.min ?? 0) + (override.errorRate ?? 0) > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="ml-auto flex h-6 items-center gap-1 rounded-md px-2 text-body-xs text-rose-400/70 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
            >
              <RotateCcw className="size-2.5" />
              Reset
            </button>
          )}
        </div>

        <div className={cn(!override.enabled && "pointer-events-none opacity-40")}>
          <div className="space-y-3">
            <SliderRow
              label="Latency (min)"
              value={override.latency?.min ?? 0}
              onChange={(v) =>
                onOverrideChange({
                  ...override,
                  latency: { ...(override.latency ?? { min: 0, max: 0, jitter: 0 }), min: v },
                })
              }
              max={2000}
              unit="ms"
            />
            <SliderRow
              label="Error Rate"
              value={override.errorRate ?? 0}
              onChange={(v) => onOverrideChange({ ...override, errorRate: v })}
              max={100}
              step={5}
              unit="%"
            />
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div
      className="flex cursor-pointer items-center gap-2 px-4 py-2 transition-colors hover:bg-muted/30"
      {...buttonProps(onToggleExpand)}
    >
      <MethodBadge method={route.httpMethod} />
      <span className="flex-1 truncate text-body-xs">
        <span className="font-mono text-foreground/70">
          {route.fullPath || route.path || `/${route.endpoint}`}
        </span>
        <span className="ml-1.5 text-muted-foreground/35">{route.endpoint}</span>
      </span>
      {override.enabled && <span className="size-1.5 shrink-0 rounded-full bg-accent-brand" />}
      <ChevronRight className="size-3 shrink-0 text-muted-foreground/30" />
    </div>
  );
}

// ── Method Badge ─────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400",
  POST: "bg-sky-500/10 text-sky-500 dark:text-sky-400",
  PUT: "bg-amber-500/10 text-amber-500 dark:text-amber-400",
  PATCH: "bg-violet-500/10 text-violet-500 dark:text-violet-400",
  DELETE: "bg-rose-500/10 text-rose-500 dark:text-rose-400",
};

function MethodBadge({ method }: { method: string }): React.ReactElement {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
        METHOD_COLORS[method] ?? "bg-muted/50 text-muted-foreground",
      )}
    >
      {method}
    </span>
  );
}
