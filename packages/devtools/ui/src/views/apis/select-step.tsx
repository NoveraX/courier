import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MethodBadge } from "@/components/shared/method-badge";

import type { ParsedSpec } from "./types";
import { countSelectedEndpoints } from "./helpers";

interface SelectStepProps {
  spec: ParsedSpec;
  selected: Record<string, string[]>;
  onToggleEndpoint: (group: string, endpoint: string) => void;
  onToggleGroup: (group: string) => void;
  onToggleAll: () => void;
}

export function SelectStepView({
  spec,
  selected,
  onToggleEndpoint,
  onToggleGroup,
  onToggleAll,
}: SelectStepProps): React.ReactElement {
  const totalEndpoints = spec.groups.reduce((n, g) => n + g.endpoints.length, 0);
  const selectedCount = countSelectedEndpoints(selected);
  const allSelected = selectedCount === totalEndpoints;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-h3 text-foreground">Select Endpoints</h3>
          <p className="text-body-sm text-muted-foreground">
            {selectedCount} of {totalEndpoints} selected
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onToggleAll}>
          {allSelected ? "Deselect all" : "Select all"}
        </Button>
      </div>

      {/* Groups */}
      <div className="space-y-3">
        {spec.groups.map((group) => {
          const groupSelected = selected[group.name] ?? [];
          const isAllGroupSelected = groupSelected.length === group.endpoints.length;
          const isPartial = groupSelected.length > 0 && !isAllGroupSelected;

          return (
            <div key={group.name} className="rounded-lg border border-border-subtle overflow-hidden">
              {/* Group header */}
              <label className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors">
                <Checkbox
                  checked={isPartial ? "indeterminate" : isAllGroupSelected}
                  onCheckedChange={() => onToggleGroup(group.name)}
                  className="size-3.5"
                />
                <span className="text-xs font-semibold text-foreground">{group.name}</span>
                {group.prefix && (
                  <span className="text-[10px] text-muted-foreground font-mono">{group.prefix}</span>
                )}
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {groupSelected.length}/{group.endpoints.length}
                </Badge>
              </label>

              {/* Endpoints */}
              <div className="divide-y divide-border-subtle">
                {group.endpoints.map((ep) => {
                  const isSelected = groupSelected.includes(ep.name);
                  return (
                    <label
                      key={ep.name}
                      className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/20 transition-colors cursor-pointer"
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleEndpoint(group.name, ep.name)}
                        className="size-3.5"
                      />
                      <MethodBadge method={ep.httpMethod} className="shrink-0" />
                      <span className="text-xs text-foreground font-mono truncate">{ep.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate ml-auto">
                        {ep.path}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
