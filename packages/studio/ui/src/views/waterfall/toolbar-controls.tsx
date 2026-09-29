import { ArrowDownWideNarrow, Layers, Maximize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { KbdHint } from "@/components/shared/kbd-hint";
import { SegmentedControl } from "@/components/shared/segmented-control";
import type { SingleSelectOption } from "@/components/shared/single-select";
import { SingleSelect } from "@/components/shared/single-select";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { WaterfallGroupBy, WaterfallSortField } from "@/store/types";
import type { ModeFilter } from "./types";

// ── Sort select ────────────────────────────────────────────────────────────

const SORT_OPTIONS: SingleSelectOption[] = [
  { value: "startTime", label: "Start Time", icon: ArrowDownWideNarrow },
  { value: "duration", label: "Duration", icon: ArrowDownWideNarrow },
  { value: "size", label: "Size", icon: ArrowDownWideNarrow },
];

export function SortSelect({
  value,
  onChange,
}: {
  value: WaterfallSortField;
  onChange: (v: WaterfallSortField) => void;
}): React.ReactElement {
  return (
    <SingleSelect
      options={SORT_OPTIONS}
      value={value}
      onChange={(v) => onChange(v as WaterfallSortField)}
    />
  );
}

// ── Group select ───────────────────────────────────────────────────────────

const GROUP_OPTIONS: SingleSelectOption[] = [
  { value: "none", label: "No grouping", icon: Layers },
  { value: "source", label: "By source", icon: Layers },
  { value: "group", label: "By group", icon: Layers },
];

export function GroupSelect({
  value,
  onChange,
}: {
  value: WaterfallGroupBy;
  onChange: (v: WaterfallGroupBy) => void;
}): React.ReactElement {
  return (
    <SingleSelect
      options={GROUP_OPTIONS}
      value={value}
      onChange={(v) => onChange(v as WaterfallGroupBy)}
    />
  );
}

// ── Mode toggle ────────────────────────────────────────────────────────────

const MODE_OPTIONS = [
  { value: "all" as const, label: "All" },
  { value: "direct" as const, label: "Direct" },
  { value: "proxy" as const, label: "Proxy" },
];

export function ModeToggle({
  value,
  onChange,
}: {
  value: ModeFilter;
  onChange: (v: ModeFilter) => void;
}): React.ReactElement {
  return <SegmentedControl options={MODE_OPTIONS} value={value} onChange={onChange} />;
}

// ── Zoom controls ──────────────────────────────────────────────────────────

export function ZoomControls({
  zoom,
  onIn,
  onOut,
  onReset,
  onFit,
}: {
  zoom: number;
  onIn: () => void;
  onOut: () => void;
  onReset: () => void;
  onFit: () => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-0.5">
      <ZoomButton icon={ZoomIn} tooltip="Zoom in" kbd="+" onClick={onIn} />
      <ZoomButton icon={ZoomOut} tooltip="Zoom out" kbd="-" onClick={onOut} />
      <ZoomButton icon={Maximize2} tooltip="Fit to view" onClick={onFit} />
      <ZoomButton
        icon={RotateCcw}
        tooltip="Reset zoom"
        kbd="0"
        onClick={onReset}
        disabled={zoom === 1}
      />
    </div>
  );
}

function ZoomButton({
  icon: Icon,
  tooltip,
  kbd,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  kbd?: string;
  onClick: () => void;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" onClick={onClick} disabled={disabled}>
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        {tooltip}
        {kbd && <KbdHint keys={kbd} />}
      </TooltipContent>
    </Tooltip>
  );
}
