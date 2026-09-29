import { Eye, FileCode, ShieldAlert, ShieldCheck, Zap } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { computeAnalysisStats, countScannedEndpoints } from "./helpers";
import type { ScannedSource } from "./types";

interface ScannedCardProps {
  source: ScannedSource;
}

export function ScannedCard({ source }: ScannedCardProps): React.ReactElement {
  const endpointCount = countScannedEndpoints(source);
  const analysisStats = computeAnalysisStats(source);

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border border-dashed border-border-subtle p-4 bg-card/50 transition-all hover:bg-card/80 hover:border-border">
      {/* Header */}
      <div className="flex items-start gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
          <FileCode className="size-4 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <h3 className="text-h3 text-foreground truncate">{source.name}</h3>
          <p className="text-[10px] text-muted-foreground truncate">
            {source.filePath.replace(/\/[^/]+$/, "")}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground truncate">
        <span className="shrink-0">
          {endpointCount} {endpointCount === 1 ? "endpoint" : "endpoints"}
        </span>
        <span className="shrink-0">·</span>
        <span className="shrink-0">
          {source.groups.length} {source.groups.length === 1 ? "group" : "groups"}
        </span>
        {source.baseURL && (
          <>
            <span className="shrink-0">·</span>
            <span className="truncate">{source.baseURL}</span>
          </>
        )}
      </div>

      {/* Quality indicators */}
      <div className="flex items-center gap-2">
        <QualityPill
          icon={Eye}
          label="R"
          count={analysisStats.responseType.count}
          total={analysisStats.responseType.total}
          tooltip="Response types"
        />
        <QualityPill
          icon={Zap}
          label="V"
          count={analysisStats.variablesType.count}
          total={analysisStats.variablesType.total}
          tooltip="Variables types"
        />
        <QualityPill
          icon={
            analysisStats.validation.count === analysisStats.validation.total
              ? ShieldCheck
              : ShieldAlert
          }
          label="S"
          count={analysisStats.validation.count}
          total={analysisStats.validation.total}
          tooltip="Validation schemas"
        />
      </div>
    </div>
  );
}

// ── Quality pill ────────────────────────────────────────────────────────────

function QualityPill({
  icon: Icon,
  label,
  count,
  total,
  tooltip,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  total: number;
  tooltip: string;
}): React.ReactElement {
  const allCovered = total > 0 && count === total;
  const showFraction = total > 0 && count !== total;
  const color = allCovered
    ? "text-emerald-400 bg-emerald-500/10"
    : count > 0
      ? "text-amber-400 bg-amber-500/10"
      : "text-zinc-500 bg-zinc-500/10";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${color}`}
        >
          <Icon className="size-2.5" />
          {label}
          {showFraction ? ` ${count}/${total}` : ""}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {tooltip}: {count} of {total}
      </TooltipContent>
    </Tooltip>
  );
}
