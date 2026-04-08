/**
 * Endpoint list rendering for the scenario detail panel.
 *
 * Contains the section labels, the endpoint row layout (method badge +
 * status pill + latency hint) and the helper that buckets endpoints into
 * named groups.
 */

import { Clock } from "lucide-react";

import { MethodBadge } from "@/components/shared/method-badge";
import { Badge } from "@/components/ui/badge";

import type { MockScenarioEndpoint } from "@/store/mock-slice";

interface EndpointSectionProps {
  label: string;
  endpoints: MockScenarioEndpoint[];
}

export function EndpointSection({ label, endpoints }: EndpointSectionProps): React.ReactElement {
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
  const variant = (isError ? "rose" : isSeq ? "indigo" : isCustom ? "amber" : "emerald") as
    | "rose"
    | "indigo"
    | "amber"
    | "emerald";

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

/** Bucket endpoints by their `group` field — `null` rows must be filtered out by the caller. */
export function groupByField(
  endpoints: MockScenarioEndpoint[],
): Record<string, MockScenarioEndpoint[]> {
  const groups: Record<string, MockScenarioEndpoint[]> = {};
  for (const ep of endpoints) {
    const key = ep.group ?? "ungrouped";
    (groups[key] ??= []).push(ep);
  }
  return groups;
}
