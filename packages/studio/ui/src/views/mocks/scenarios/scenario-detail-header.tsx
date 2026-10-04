/**
 * Header of the scenario detail panel: the scenario's type, tags and whether
 * it is active, and the buttons that activate or deactivate it with the
 * `mock:scenario:apply` socket command.
 */

import { RotateCcw, X, Zap } from "lucide-react";

import { KbdHint } from "@/components/shared/kbd-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSocket } from "@/socket";

import type { MockScenarioEntry } from "@/store/mock-slice";
import {
  SCENARIO_TYPE_GRADIENT,
  SCENARIO_TYPE_ICON_BG,
  SCENARIO_TYPE_META,
  SCENARIO_TYPE_RING,
  type ScenarioType,
} from "./scenario-utils";

interface ScenarioDetailHeaderProps {
  scenario: MockScenarioEntry;
  type: ScenarioType;
  isActive: boolean;
  serverId: string;
  onClose: () => void;
}

export function ScenarioDetailHeader({
  scenario,
  type,
  isActive,
  serverId,
  onClose,
}: ScenarioDetailHeaderProps): React.ReactElement {
  const meta = SCENARIO_TYPE_META[type];
  const TypeIcon = meta.icon;
  const tags = scenario.tags ?? [];

  const handleActivate = (): void => {
    getSocket().emit("mock:command", {
      action: "mock:scenario:apply",
      serverId,
      scenario: scenario.name,
    });
  };

  const handleDeactivate = (): void => {
    getSocket().emit("mock:command", {
      action: "mock:scenario:apply",
      serverId,
      scenario: "happy-path",
    });
  };

  return (
    <>
      <div
        className={cn(
          "relative overflow-hidden border-b border-border-subtle bg-linear-to-b px-5 pb-5 pt-4",
          SCENARIO_TYPE_GRADIENT[type],
        )}
      >
        <div
          className={cn(
            "pointer-events-none absolute -right-8 -top-8 size-44 rounded-full opacity-20 blur-3xl",
            SCENARIO_TYPE_ICON_BG[type],
          )}
        />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label="Close panel"
          className="absolute right-4 top-4 z-10"
        >
          <X className="size-3.5" />
        </Button>

        <div className="relative flex items-center gap-3.5 pr-8">
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1",
              SCENARIO_TYPE_ICON_BG[type],
              SCENARIO_TYPE_RING[type],
            )}
          >
            <TypeIcon className="size-5" />
          </div>
          <h2 className="min-w-0 flex-1 text-xl font-bold leading-tight tracking-tight text-foreground">
            {scenario.name}
          </h2>
        </div>

        <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
          {tags.length > 0 ? (
            tags.map((tag) => {
              const tagMeta = SCENARIO_TYPE_META[tag as ScenarioType];
              return tagMeta ? (
                <Badge key={tag} variant={tagMeta.color} className="px-2 py-0.5 text-[10px]">
                  {tagMeta.label}
                </Badge>
              ) : (
                <Badge key={tag} variant="secondary" className="px-2 py-0.5 text-[10px]">
                  {tag}
                </Badge>
              );
            })
          ) : (
            <Badge variant={meta.color} className="px-2 py-0.5 text-[10px]">
              {meta.label}
            </Badge>
          )}
          {isActive && <ActivePill />}
        </div>
      </div>

      <div className="shrink-0 border-b border-border-subtle p-3">
        {isActive ? (
          <button
            type="button"
            onClick={handleDeactivate}
            className="group flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border-subtle text-muted-foreground/55 transition-colors hover:border-rose-500/25 hover:bg-rose-500/5 hover:text-rose-400"
          >
            <RotateCcw className="size-3.5 transition-transform duration-500 ease-in-out group-hover:-rotate-180" />
            <span className="text-xs font-medium">Deactivate Scenario</span>
          </button>
        ) : (
          <Button
            className="w-full h-9 cursor-pointer gap-2 bg-accent-brand text-xs font-semibold text-white hover:bg-accent-brand/90"
            onClick={handleActivate}
          >
            <Zap className="size-3.5" />
            Activate Scenario
            <KbdHint
              keys="mod+enter"
              className="h-4 min-w-4 text-[9px] bg-white/15 text-white ring-1 ring-inset ring-white/30"
            />
          </Button>
        )}
      </div>
    </>
  );
}

function ActivePill(): React.ReactElement {
  return (
    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 ring-1 ring-emerald-500/20">
      <span className="relative flex size-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
      </span>
      <span className="text-[10px] font-semibold text-emerald-500">Active</span>
    </span>
  );
}
