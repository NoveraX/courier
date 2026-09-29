import { MethodBadge } from "@/components/shared/method-badge";
import { cn } from "@/lib/utils";

import { TimingBar } from "./timing-bar";

import type { TimingGroup, TimingRow } from "./timing-types";

// ── Props ──────────────────────────────────────────────────────────────────

interface HeatmapGridProps {
  groups: TimingGroup[];
  maxTotal: number;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function HeatmapGrid({
  groups,
  maxTotal,
  selectedKey,
  onSelect,
}: HeatmapGridProps): React.ReactElement {
  return (
    <div className="space-y-4 p-4">
      {groups.map((group) => (
        <GroupSection
          key={group.name}
          group={group}
          maxTotal={maxTotal}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// ── Group section ──────────────────────────────────────────────────────────

function GroupSection({
  group,
  maxTotal,
  selectedKey,
  onSelect,
}: {
  group: TimingGroup;
  maxTotal: number;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}): React.ReactElement {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
        {group.name}
        <span className="ml-1.5 text-muted-foreground/25">{group.rows.length}</span>
      </div>
      <div className="space-y-px">
        {group.rows.map((row) => (
          <EndpointRow
            key={`${row.source}.${row.group}.${row.method}`}
            row={row}
            maxTotal={maxTotal}
            isSelected={selectedKey === `${row.source}.${row.group}.${row.method}`}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

// ── Endpoint row ───────────────────────────────────────────────────────────

function EndpointRow({
  row,
  maxTotal,
  isSelected,
  onSelect,
}: {
  row: TimingRow;
  maxTotal: number;
  isSelected: boolean;
  onSelect: (key: string) => void;
}): React.ReactElement {
  const key = `${row.source}.${row.group}.${row.method}`;
  const isEmpty = row.sampleCount === 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(key)}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-2 py-1 transition-colors hover:bg-muted/20",
        isSelected && "bg-muted/30 ring-1 ring-accent-brand/40",
        isEmpty && "opacity-35",
      )}
    >
      <div className="flex w-44 shrink-0 items-center gap-2 overflow-hidden">
        <MethodBadge method={row.httpMethod} className="text-[9px]" />
        <span className="truncate text-body-xs text-foreground/80">{row.method}</span>
      </div>

      {row.bottleneck && (
        <span className="w-16 shrink-0 text-[10px] text-muted-foreground/40">{row.bottleneck}</span>
      )}

      <TimingBar phases={row.phases} total={row.avgTotal} maxTotal={maxTotal} />

      {row.sampleCount > 0 && (
        <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/30">
          ×{row.sampleCount}
        </span>
      )}
    </button>
  );
}
