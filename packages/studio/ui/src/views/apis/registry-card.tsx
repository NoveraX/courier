/**
 * Registry card — primary display for an imported API source.
 *
 * Renders header, stats row, quality pills, and status. The dropdown menu
 * and quality pill live in sibling files; status/icon maps live in
 * `registry-card-constants.ts`.
 */

import {
  ExternalLink,
  Eye,
  Globe,
  Loader2,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { SourceStatusInfo } from "./types";
import type { EnrichedSource } from "./use-registry";
import { computeAnalysisStats, countScannedEndpoints } from "./helpers";
import { IMPORT_ICON, STATUS_CONFIG } from "./registry-card-constants";
import { CardMenu } from "./registry-card-menu";
import { QualityPill } from "./registry-card-quality";

interface RegistryCardProps {
  source: EnrichedSource;
  status?: SourceStatusInfo;
  onCheckUpdates: () => void;
  onManage: () => void;
  onRemove: () => void;
}

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
  const validation = reg?.options.validation;
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

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground truncate">
        <span className="shrink-0">{endpointCount} {endpointCount === 1 ? "endpoint" : "endpoints"}</span>
        <span className="shrink-0">·</span>
        <span className="shrink-0">{groupCount} {groupCount === 1 ? "group" : "groups"}</span>
        {validation && (
          <>
            <span className="shrink-0">·</span>
            <span className="shrink-0">{validation}</span>
          </>
        )}
        {source.baseURL && (
          <>
            <span className="shrink-0">·</span>
            <span className="truncate">{source.baseURL}</span>
          </>
        )}
      </div>

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
