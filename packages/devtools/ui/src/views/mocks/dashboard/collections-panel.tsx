import { Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MockCollectionEntry } from "@/store/mock-slice";

interface CollectionsPanelProps {
  collections: MockCollectionEntry[];
}

export function CollectionsPanel({ collections }: CollectionsPanelProps): React.ReactElement {
  const total = collections.reduce((sum, c) => sum + c.count, 0);
  const maxCount = Math.max(...collections.map((c) => c.count), 1);

  return (
    <div className="rounded-xl border border-border-subtle bg-card p-4">
      <div className="flex items-center gap-2">
        <Database className="size-3.5 text-muted-foreground/50" />
        <span className="text-caption text-muted-foreground/70">COLLECTIONS</span>
        <span className="text-caption text-muted-foreground/40">{collections.length}</span>
        <span className="ml-auto text-body-xs text-muted-foreground/50">{total} total records</span>
      </div>

      {collections.length === 0 ? (
        <div className="flex items-center justify-center py-6">
          <p className="text-body-xs text-muted-foreground/50">No collections</p>
        </div>
      ) : (
        <div className="mt-3 space-y-1">
          {collections.map((col) => (
            <CollectionRow key={col.name} name={col.name} count={col.count} maxCount={maxCount} />
          ))}
        </div>
      )}
    </div>
  );
}

function CollectionRow({
  name,
  count,
  maxCount,
}: {
  name: string;
  count: number;
  maxCount: number;
}): React.ReactElement {
  const percent = (count / maxCount) * 100;

  return (
    <div className="group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors hover:bg-muted/20">
      {/* Progress bar background */}
      <div
        className="absolute inset-y-0 left-0 rounded-md bg-accent-brand/5 transition-all"
        style={{ width: `${percent}%` }}
      />

      <Database className="relative size-3 text-muted-foreground/40" />
      <span className="relative flex-1 text-body-sm font-medium">{name}</span>
      <Badge variant="secondary" className="relative text-[10px] tabular-nums">
        {count}
      </Badge>
    </div>
  );
}
