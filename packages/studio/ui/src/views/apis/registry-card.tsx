import {
  Globe,
  FileUp,
  FileText,
  MoreHorizontal,
  Trash2,
  RefreshCw,
  Loader2,
  ExternalLink,
  Eye,
  Zap,
  ShieldCheck,
  ShieldAlert,
  Settings2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { SourceStatusInfo } from "./types";
import type { EnrichedSource } from "./use-registry";
import { computeAnalysisStats, countScannedEndpoints } from "./helpers";

// ── Types ───────────────────────────────────────────────────────────────────

interface RegistryCardProps {
  source: EnrichedSource;
  status?: SourceStatusInfo;
  onCheckUpdates: () => void;
  onManage: () => void;
  onRemove: () => void;
}

// ── Constants ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
  label: string;
  variant: "emerald" | "amber" | "rose" | "secondary";
}> = {
  "up-to-date": { label: "Up to date", variant: "emerald" },
  "updates-available": { label: "Update available", variant: "amber" },
  checking: { label: "Checking…", variant: "secondary" },
  error: { label: "Error", variant: "rose" },
};

const IMPORT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  url: Globe,
  file: FileUp,
  raw: FileText,
};

// ── Component ───────────────────────────────────────────────────────────────

export function RegistryCard({
  source,
  status,
  onCheckUpdates,
  onManage,
  onRemove,
}: RegistryCardProps): React.ReactElement {
  const reg = source.registry;
  const statusCfg = status ? STATUS_CONFIG[status.status] : null;
  const hasUpdates = status?.status === "updates-available";
  const isChecking = status?.status === "checking";
  const importType = reg?.importType ?? "file";
  const Icon = IMPORT_ICON[importType] ?? Globe;
  const endpointCount = countScannedEndpoints(source);
  const groupCount = source.groups.length;
  const filePath = source.filePath.replace(/\/[^/]+$/, "");
  const validation = reg?.options.validation ?? "none";
  const stats = computeAnalysisStats(source);

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border p-4",
        "bg-card transition-all hover:bg-card/80",
        hasUpdates
          ? "border-amber-500/30 shadow-[0_0_12px_-3px] shadow-amber-500/10"
          : "border-border-subtle hover:border-border",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20">
            <Icon className="size-4 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-h3 text-foreground truncate">{source.name}</h3>
            <p className="text-[10px] text-muted-foreground truncate">{filePath}</p>
          </div>
        </div>

        <CardMenu
          isUrl={importType === "url"}
          isChecking={isChecking}
          onCheckUpdates={onCheckUpdates}
          onManage={onManage}
          onRemove={onRemove}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground truncate">
        <span className="shrink-0">{endpointCount} {endpointCount === 1 ? "endpoint" : "endpoints"}</span>
        <span className="shrink-0">·</span>
        <span className="shrink-0">{groupCount} {groupCount === 1 ? "group" : "groups"}</span>
        <span className="shrink-0">·</span>
        <span className="shrink-0">{validation}</span>
        {source.baseURL && (
          <>
            <span className="shrink-0">·</span>
            <span className="truncate">{source.baseURL}</span>
          </>
        )}
      </div>

      {/* Quality + status row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <QualityPill icon={Eye} label="R" count={stats.responseType.count} total={stats.responseType.total} tooltip="Response types" />
          <QualityPill icon={Zap} label="V" count={stats.variablesType.count} total={stats.variablesType.total} tooltip="Variables types" />
          <QualityPill
            icon={stats.validation.count === stats.validation.total ? ShieldCheck : ShieldAlert}
            label="S"
            count={stats.validation.count}
            total={stats.validation.total}
            tooltip="Validation schemas"
          />

          {statusCfg && (
            <Badge variant={statusCfg.variant} className="border-0 text-[10px] ml-1">
              {isChecking && <Loader2 className="mr-1 size-2.5 animate-spin" />}
              {statusCfg.label}
            </Badge>
          )}
        </div>

        {hasUpdates && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 text-[10px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            onClick={onManage}
          >
            <Settings2 className="size-3" />
            Manage
          </Button>
        )}

        {reg?.specUrl && !hasUpdates && (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={reg.specUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="size-3" />
              </a>
            </TooltipTrigger>
            <TooltipContent>Open spec URL</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

// ── Card menu ───────────────────────────────────────────────────────────────

function CardMenu({ isUrl, isChecking, onCheckUpdates, onManage, onRemove }: {
  isUrl: boolean;
  isChecking?: boolean;
  onCheckUpdates: () => void;
  onManage: () => void;
  onRemove: () => void;
}): React.ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onManage}>
          <Settings2 className="size-3.5" />
          Manage endpoints
        </DropdownMenuItem>
        {isUrl && (
          <DropdownMenuItem onClick={onCheckUpdates} disabled={isChecking}>
            <RefreshCw className="size-3.5" />
            Check updates
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onRemove}>
          <Trash2 className="size-3.5" />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Quality pill ────────────────────────────────────────────────────────────

function QualityPill({ icon: PillIcon, label, count, total, tooltip }: {
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
        <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
          <PillIcon className="size-2.5" />
          {label}{showFraction ? ` ${count}/${total}` : ""}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}: {count} of {total}</TooltipContent>
    </Tooltip>
  );
}
