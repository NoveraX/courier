import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ChevronRight, Play } from "lucide-react";
import {
  deriveScenarioType,
  SCENARIO_TYPE_ICON_BG,
  SCENARIO_TYPE_META,
  SCENARIO_TYPE_RING,
} from "./scenario-utils";

import type { MockScenarioEntry } from "@/store/mock-slice";
import type { ScenarioType } from "./scenario-utils";

interface ScenarioRowProps {
  scenario: MockScenarioEntry;
  isActive: boolean;
  isSelected: boolean;
  totalRoutes: number;
  onSelect: (scenario: MockScenarioEntry) => void;
  onActivate: (scenario: MockScenarioEntry) => void;
}

function ActivePill(): React.ReactElement {
  return (
    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 ring-1 ring-emerald-500/20">
      <span className="relative flex size-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
      </span>
      <span className="text-[9px] font-semibold tracking-wide text-emerald-500">ACTIVE</span>
    </span>
  );
}

function TagBadges({ scenario, fallbackType }: { scenario: MockScenarioEntry; fallbackType: ScenarioType }): React.ReactElement {
  const tags = scenario.tags ?? [];

  if (tags.length === 0) {
    const meta = SCENARIO_TYPE_META[fallbackType];
    return <Badge variant={meta.color} className="px-1.5 py-0 text-[9px]">{meta.label}</Badge>;
  }

  return (
    <>
      {tags.map((tag) => {
        const meta = SCENARIO_TYPE_META[tag as ScenarioType];
        return meta
          ? <Badge key={tag} variant={meta.color} className="px-1.5 py-0 text-[9px]">{meta.label}</Badge>
          : <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[9px]">{tag}</Badge>;
      })}
    </>
  );
}

export function ScenarioRow({
  scenario,
  isActive,
  isSelected,
  totalRoutes,
  onSelect,
  onActivate,
}: ScenarioRowProps): React.ReactElement {
  const type = deriveScenarioType(scenario);
  const TypeIcon = SCENARIO_TYPE_META[type].icon;

  const handleActivateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onActivate(scenario);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(scenario)}
      onKeyDown={(e) => e.key === "Enter" && onSelect(scenario)}
      className={cn(
        "group flex items-center gap-4 py-3.5 pr-4 transition-colors cursor-pointer select-none",
        "border-b border-border-subtle/50 last:border-0 border-l-2",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent-brand/40",
        isSelected
          ? "border-l-accent-brand bg-accent-brand/8"
          : "border-l-transparent hover:bg-muted/40",
        "pl-4.5",
      )}
    >
      {/* Type icon */}
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl ring-1",
          SCENARIO_TYPE_ICON_BG[type],
          SCENARIO_TYPE_RING[type],
        )}
      >
        <TypeIcon className="size-4" />
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground/90 leading-none">
            {scenario.name}
          </span>
          {isActive && <ActivePill />}
        </div>
        <p
          className={cn(
            "text-xs mt-1 leading-snug line-clamp-1",
            scenario.description
              ? "text-muted-foreground/55"
              : "italic text-muted-foreground/25",
          )}
        >
          {scenario.description ?? "No description"}
        </p>
      </div>

      {/* Right: tags + count/activate + chevron */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Tag badges */}
        <div className="flex items-center gap-1">
          <TagBadges scenario={scenario} fallbackType={type} />
        </div>

        {/* Count (idle) → Activate button (hover, not active) */}
        <div className="relative flex w-9 shrink-0 items-center justify-end">
          {totalRoutes > 0 && (
            <span
              className={cn(
                "text-right text-[11px] tabular-nums transition-opacity duration-150",
                isActive ? "text-emerald-500/55" : "text-muted-foreground/35 group-hover:opacity-0",
              )}
            >
              {scenario.endpointCount}/{totalRoutes}
            </span>
          )}
          {!isActive && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Activate scenario"
                  onClick={handleActivateClick}
                  className="absolute inset-0 flex cursor-pointer items-center justify-end opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                >
                  <Play className="size-3.5 fill-accent-brand text-accent-brand" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="flex items-center gap-1.5">
                Activate scenario
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Clickability hint */}
        <ChevronRight className="size-3 shrink-0 text-muted-foreground/20 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
      </div>
    </div>
  );
}
