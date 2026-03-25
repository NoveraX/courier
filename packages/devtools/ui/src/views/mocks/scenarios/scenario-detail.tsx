import { KbdHint } from "@/components/shared/kbd-hint";
import { MethodBadge } from "@/components/shared/method-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSocket } from "@/socket";
import { Clock, RotateCcw, Tag, X, Zap } from "lucide-react";
import {
  coveragePercent,
  deriveScenarioType,
  SCENARIO_TYPE_GRADIENT,
  SCENARIO_TYPE_ICON_BG,
  SCENARIO_TYPE_META,
  SCENARIO_TYPE_RING,
} from "./scenario-utils";
import { StateMachineDiagram } from "./state-machine-diagram";

import type { MockScenarioEndpoint, MockScenarioEntry } from "@/store/mock-slice";
import type { ScenarioType } from "./scenario-utils";

interface ScenarioDetailProps {
  scenario: MockScenarioEntry;
  isActive: boolean;
  totalRoutes: number;
  serverId: string;
  onClose: () => void;
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

export function ScenarioDetail({
  scenario,
  isActive,
  totalRoutes,
  serverId,
  onClose,
}: ScenarioDetailProps): React.ReactElement {
  const type = deriveScenarioType(scenario);
  const meta = SCENARIO_TYPE_META[type];
  const TypeIcon = meta.icon;
  const coverage = coveragePercent(scenario.endpointCount, totalRoutes);
  const okCount = scenario.endpoints.filter((e) => e.behavior === "resolves" || e.behavior === "returns").length;
  const errorCount = scenario.endpoints.filter((e) => e.behavior === "rejects").length;
  const seqCount = scenario.endpoints.filter((e) => e.behavior === "sequence").length;
  const topLevel = scenario.endpoints.filter((e) => e.group === null);
  const grouped = groupByField(scenario.endpoints.filter((e) => e.group !== null));
  const tags = scenario.tags ?? [];

  const handleActivate = () => {
    getSocket().emit("mock:command", { action: "mock:scenario:apply", serverId, scenario: scenario.name });
  };

  const handleDeactivate = () => {
    getSocket().emit("mock:command", { action: "mock:scenario:apply", serverId, scenario: "happy-path" });
  };

  return (
    <div className="flex h-full w-105 shrink-0 flex-col border-l border-border-subtle bg-background">
      {/* Hero header */}
      <div className={cn("relative overflow-hidden border-b border-border-subtle bg-linear-to-b px-5 pb-5 pt-4", SCENARIO_TYPE_GRADIENT[type])}>
        {/* Decorative glow */}
        <div className={cn("pointer-events-none absolute -right-8 -top-8 size-44 rounded-full opacity-20 blur-3xl", SCENARIO_TYPE_ICON_BG[type])} />

        {/* Close button — z-10 so it renders above the relative sibling divs below */}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label="Close panel"
          className="absolute right-4 top-4 z-10"
        >
          <X className="size-3.5" />
        </Button>

        {/* Icon + name */}
        <div className="relative flex items-center gap-3.5 pr-8">
          <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1", SCENARIO_TYPE_ICON_BG[type], SCENARIO_TYPE_RING[type])}>
            <TypeIcon className="size-5" />
          </div>
          <h2 className="min-w-0 flex-1 text-xl font-bold leading-tight tracking-tight text-foreground">{scenario.name}</h2>
        </div>

        {/* Tags row — below icon+name */}
        <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
          {tags.length > 0
            ? tags.map((tag) => {
                const tagMeta = SCENARIO_TYPE_META[tag as ScenarioType];
                return tagMeta
                  ? <Badge key={tag} variant={tagMeta.color} className="px-2 py-0.5 text-[10px]">{tagMeta.label}</Badge>
                  : <Badge key={tag} variant="secondary" className="px-2 py-0.5 text-[10px]">{tag}</Badge>;
              })
            : <Badge variant={meta.color} className="px-2 py-0.5 text-[10px]">{meta.label}</Badge>
          }
          {isActive && <ActivePill />}
        </div>
      </div>

      {/* Activate / Deactivate CTA */}
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
            <KbdHint keys="mod+enter" className="h-4 min-w-4 text-[9px] bg-white/15 text-white ring-1 ring-inset ring-white/30" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Metric cells */}
        {scenario.endpointCount > 0 && (
          <div className="flex items-stretch divide-x divide-border-subtle/60 border-b border-border-subtle">
            {totalRoutes > 0 && <MetricCell label="Coverage" value={`${coverage}%`} />}
            <MetricCell label="Endpoints" value={String(scenario.endpointCount)} />
            {okCount > 0 && <MetricCell label="OK" value={String(okCount)} valueClass="text-emerald-500" />}
            {errorCount > 0 && <MetricCell label="Errors" value={String(errorCount)} valueClass="text-rose-500" />}
            {seqCount > 0 && <MetricCell label="Seq" value={String(seqCount)} valueClass="text-indigo-500" />}
          </div>
        )}

        {/* Coverage bar */}
        {totalRoutes > 0 && scenario.endpointCount > 0 && (
          <div className="border-b border-border-subtle px-5 py-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
              <div className="h-full rounded-full bg-accent-brand/50 transition-all" style={{ width: `${coverage}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between">
              <span className="text-caption text-muted-foreground/40">Route coverage</span>
              <span className="text-caption tabular-nums text-muted-foreground/50">{scenario.endpointCount} / {totalRoutes}</span>
            </div>
          </div>
        )}

        {/* Description + tags */}
        {(scenario.description || tags.length > 0) && (
          <div className="border-b border-border-subtle px-5 py-4 space-y-3">
            {scenario.description && (
              <p className="text-body-xs leading-relaxed text-muted-foreground/65">{scenario.description}</p>
            )}
            {tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Tag className="size-3 shrink-0 text-muted-foreground/30" />
                {tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-muted/60 px-2 py-0.5 text-caption text-muted-foreground/60 ring-1 ring-border-subtle">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* State machine */}
        {scenario.hasStateMachine && (
          <div className="border-b border-border-subtle">
            <SectionLabel label="State Machine" />
            <StateMachineDiagram initialState={undefined} transitions={scenario.stateTransitions} />
          </div>
        )}

        {/* Endpoint list */}
        {topLevel.length > 0 && <EndpointSection label="Endpoints" endpoints={topLevel} />}
        {Object.entries(grouped).map(([group, endpoints]) => (
          <EndpointSection key={group} label={group} endpoints={endpoints} />
        ))}
        {scenario.endpoints.length === 0 && (
          <div className="px-5 py-10 text-center">
            <p className="text-body-xs text-muted-foreground/35">No endpoint details available.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCell({ label, value, valueClass }: { label: string; value: string; valueClass?: string }): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 py-3.5">
      <span className={cn("text-xl font-bold tabular-nums leading-none", valueClass ?? "text-foreground/80")}>{value}</span>
      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">{label}</span>
    </div>
  );
}

function SectionLabel({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex h-8 items-center px-5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/35">{label}</span>
    </div>
  );
}

function EndpointSection({ label, endpoints }: { label: string; endpoints: MockScenarioEndpoint[] }): React.ReactElement {
  return (
    <div className="border-t border-border-subtle">
      <div className="flex h-8 items-center px-5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/35">{label}</span>
        <span className="ml-auto text-caption tabular-nums text-muted-foreground/25">{endpoints.length}</span>
      </div>
      <div className="pb-1.5">
        {endpoints.map((ep) => (
          <EndpointRow key={`${ep.httpMethod}-${ep.group}-${ep.endpoint}`} endpoint={ep} />
        ))}
      </div>
    </div>
  );
}

function EndpointRow({ endpoint }: { endpoint: MockScenarioEndpoint }): React.ReactElement {
  const isError = endpoint.behavior === "rejects";
  const isSeq = endpoint.behavior === "sequence";
  const isCustom = endpoint.behavior === "custom";
  const label = isError ? "Error" : isSeq ? "Seq" : isCustom ? "Custom" : "OK";
  const variant = (isError ? "rose" : isSeq ? "indigo" : isCustom ? "amber" : "emerald") as "rose" | "indigo" | "amber" | "emerald";

  return (
    <div className="flex items-center gap-2 px-5 py-1.5 transition-colors hover:bg-muted/20">
      <MethodBadge method={endpoint.httpMethod} />
      <span className="mono-xs min-w-0 flex-1 truncate text-foreground/65">
        {endpoint.group ? `${endpoint.group}.` : ""}{endpoint.endpoint}
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
        <Badge variant={variant} className="px-1.5 py-0 text-[9px]">
          {label}
          {isError && endpoint.statusCode ? ` ${endpoint.statusCode}` : ""}
          {isSeq && endpoint.sequenceLength ? ` ×${endpoint.sequenceLength}` : ""}
        </Badge>
        {endpoint.latency !== undefined && (
          <span className="mono-xs flex items-center gap-0.5 tabular-nums text-muted-foreground/35">
            <Clock className="size-2.5" />{endpoint.latency}ms
          </span>
        )}
        {endpoint.stateCondition && (
          <span className="text-caption italic text-violet-400/55">{endpoint.stateCondition}</span>
        )}
      </div>
    </div>
  );
}

function groupByField(endpoints: MockScenarioEndpoint[]): Record<string, MockScenarioEndpoint[]> {
  const groups: Record<string, MockScenarioEndpoint[]> = {};
  for (const ep of endpoints) {
    const key = ep.group ?? "ungrouped";
    (groups[key] ??= []).push(ep);
  }
  return groups;
}
