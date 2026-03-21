import { Database, RotateCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { MockCollectionEntry } from "@/store/mock-slice";

interface CollectionListProps {
  collections: MockCollectionEntry[];
  active: string | null;
  onSelect: (name: string) => void;
  onSeed: (name: string, count: number) => void;
  onClear: (name: string) => void;
}

export function CollectionList({
  collections,
  active,
  onSelect,
  onSeed,
  onClear,
}: CollectionListProps): React.ReactElement {
  return (
    <div className="flex w-52 shrink-0 flex-col border-r border-border-subtle">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <Database className="size-3.5 text-muted-foreground/50" />
        <span className="text-caption text-muted-foreground/70">COLLECTIONS</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">{collections.length}</Badge>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {collections.map((col) => (
          <CollectionItem
            key={col.name}
            name={col.name}
            count={col.count}
            isActive={active === col.name}
            onSelect={() => onSelect(col.name)}
            onSeed={() => onSeed(col.name, 20)}
            onClear={() => onClear(col.name)}
          />
        ))}
      </div>
    </div>
  );
}

function CollectionItem({
  name,
  count,
  isActive,
  onSelect,
  onSeed,
  onClear,
}: {
  name: string;
  count: number;
  isActive: boolean;
  onSelect: () => void;
  onSeed: () => void;
  onClear: () => void;
}): React.ReactElement {
  return (
    <div
      className={cn(
        "group flex cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors hover:bg-muted/30",
        isActive && "bg-accent-brand/5 text-foreground",
      )}
      onClick={onSelect}
    >
      <Database className="size-3 shrink-0 text-muted-foreground/40" />
      <span className="flex-1 truncate text-body-sm">{name}</span>
      <Badge variant="secondary" className="text-[10px] tabular-nums">{count}</Badge>

      {/* Hover actions */}
      <div className="hidden items-center gap-0.5 group-hover:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-5" onClick={(e) => { e.stopPropagation(); onSeed(); }}>
              <RotateCw className="size-2.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Re-seed</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-5 hover:text-rose-400" onClick={(e) => { e.stopPropagation(); onClear(); }}>
              <Trash2 className="size-2.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Clear</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
