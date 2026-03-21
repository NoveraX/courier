import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonTree } from "@/components/shared/json-tree";

interface RecordDetailProps {
  record: Record<string, unknown>;
  collection: string;
  onClose: () => void;
}

export function RecordDetail({ record, collection, onClose }: RecordDetailProps): React.ReactElement {
  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-border-subtle bg-card">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <span className="flex-1 text-body-sm font-medium">{collection}</span>
        {record.id !== undefined && (
          <span className="font-mono text-body-xs text-muted-foreground/60">#{String(record.id)}</span>
        )}
        <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <JsonTree data={record} fill showCopy />
      </div>
    </div>
  );
}
