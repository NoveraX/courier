import type { ScannedSource } from "@/views/apis/types";
import type { MockDraft } from "./types";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function endpointCountOf(source: ScannedSource): number {
  /* A source may declare its endpoints without a group at all. */
  return (
    source.groups.reduce((sum, group) => sum + group.endpoints.length, 0) +
    (source.inlineEndpoints?.length ?? 0)
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count !== 1 ? "s" : ""}`;
}

interface SourceListProps {
  sources: readonly ScannedSource[];
  drafts: readonly MockDraft[];
  onToggle: (source: string) => void;
}

/**
 * The sources `courier.config` declares, each picked or not for a new mock.
 *
 * @param props - The sources, the drafts picked, and the toggle handler
 * @returns The list
 *
 * @example
 * ```tsx
 * <SourceList sources={scanSources} drafts={state.drafts} onToggle={toggleSource} />
 * ```
 */
export function SourceList({ sources, drafts, onToggle }: SourceListProps): React.ReactElement {
  return (
    <div className="space-y-2">
      {sources.map((source) => {
        const endpointCount = endpointCountOf(source);
        const selected = drafts.some((draft) => draft.source === source.name);
        return (
          <button
            key={source.name}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(source.name)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
              selected
                ? "border-accent-brand/50 bg-accent-brand/5 ring-1 ring-accent-brand/20"
                : "border-border-subtle hover:bg-muted/30",
            )}
          >
            <div
              className={cn(
                "flex size-4 items-center justify-center rounded border transition-colors",
                selected ? "border-accent-brand bg-accent-brand text-white" : "border-border-strong bg-background",
              )}
            >
              {selected && <span className="text-[9px] font-bold">✓</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-medium">{source.name}</p>
              <p className="truncate text-body-xs text-muted-foreground">{source.baseURL || "No base URL"}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {plural(source.groups.length, "group")}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {plural(endpointCount, "endpoint")}
              </Badge>
            </div>
          </button>
        );
      })}
    </div>
  );
}
