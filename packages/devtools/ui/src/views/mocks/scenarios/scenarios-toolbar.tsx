import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CountDisplay } from "@/components/shared/count-display";
import { cn } from "@/lib/utils";
import { SCENARIO_TYPE_META, SCENARIO_TYPE_ICON_BG } from "./scenario-utils";

import type { ScenarioType } from "./scenario-utils";

const TYPE_FILTERS: ScenarioType[] = ["error", "latency", "empty", "auth", "sequence", "mixed"];

const TYPE_CHIP_ACTIVE: Record<ScenarioType, string> = {
  error:    "bg-rose-500/10   text-rose-500   border-rose-500/25",
  latency:  "bg-amber-500/10  text-amber-500  border-amber-500/25",
  empty:    "bg-sky-500/10    text-sky-500    border-sky-500/25",
  auth:     "bg-violet-500/10 text-violet-500 border-violet-500/25",
  sequence: "bg-indigo-500/10 text-indigo-500 border-indigo-500/25",
  mixed:    "bg-amber-400/10  text-amber-400  border-amber-400/25",
  unknown:  "",
};

interface ScenariosToolbarProps {
  filtered: number;
  total: number;
  search: string;
  onSearchChange: (value: string) => void;
  selectedTypes: ScenarioType[];
  onTypeToggle: (type: ScenarioType) => void;
}

export function ScenariosToolbar({
  filtered,
  total,
  search,
  onSearchChange,
  selectedTypes,
  onTypeToggle,
}: ScenariosToolbarProps): React.ReactElement {
  const clearTypes = () => {
    for (const t of selectedTypes) onTypeToggle(t);
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      {/* Search */}
      <div className="relative flex-1 max-w-56">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/40" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search scenarios…"
          className="h-7 pl-7 text-xs bg-transparent border-border-subtle focus-visible:ring-0 focus-visible:border-accent-brand/50"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      <div className="h-4 w-px bg-border-subtle" />

      {/* Type filter chips */}
      <div className="flex items-center gap-1">
        {TYPE_FILTERS.map((type) => {
          const meta = SCENARIO_TYPE_META[type];
          const Icon = meta.icon;
          const isActive = selectedTypes.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => onTypeToggle(type)}
              className={cn(
                "flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-all",
                isActive
                  ? TYPE_CHIP_ACTIVE[type]
                  : "border-transparent text-muted-foreground/50 hover:text-foreground/80 hover:bg-muted/40",
              )}
            >
              <Icon className={cn("size-2.5", isActive ? "" : SCENARIO_TYPE_ICON_BG[type].split(" ")[1])} />
              {meta.label}
            </button>
          );
        })}
        {selectedTypes.length > 0 && (
          <Button
            variant="ghost"
            size="xs"
            className="h-6 px-1.5 text-[11px] text-muted-foreground/45 hover:text-muted-foreground"
            onClick={clearTypes}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="flex-1" />
      <CountDisplay filtered={filtered} total={total} label="scenarios" />
    </div>
  );
}
