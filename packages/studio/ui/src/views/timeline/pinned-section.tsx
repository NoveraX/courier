import { Pin } from "lucide-react";

import type { RequestEntry } from "@/store/types";
import { RequestContextMenu } from "./context-menu";
import { RequestRow } from "./request-row";

interface PinnedSectionProps {
  requests: RequestEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function PinnedSection({
  requests,
  selectedId,
  onSelect,
}: PinnedSectionProps): React.ReactElement | null {
  if (requests.length === 0) return null;

  return (
    <div className="border-b border-border-subtle">
      <div className="flex items-center gap-2 px-3 py-1.5 text-body-sm text-violet-400">
        <Pin className="size-3" />
        <span className="font-medium">Pinned ({requests.length})</span>
      </div>
      {requests.map((r) => (
        <RequestContextMenu key={r.id} request={r}>
          <RequestRow request={r} selected={selectedId === r.id} onSelect={onSelect} />
        </RequestContextMenu>
      ))}
    </div>
  );
}
