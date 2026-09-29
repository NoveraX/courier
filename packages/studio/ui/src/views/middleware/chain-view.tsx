import { ArrowLeft, Unlink } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

import type { RequestEntry } from "@/store/types";
import { ChainContext } from "./chain-context";
import { Pipeline } from "./pipeline";
import { RequestPicker } from "./request-picker";
import type { AggregateMiddleware, ChainEntry } from "./types";

// ── Props ──────────────────────────────────────────────────────────────────

interface ChainViewProps {
  requests: RequestEntry[];
  selectedId: string | undefined;
  selectedRequest: RequestEntry | null;
  chain: ChainEntry | null;
  aggregateStats: AggregateMiddleware[];
  onSelectRequest: (id: string) => void;
  onBack: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function ChainView({
  requests,
  selectedId,
  selectedRequest,
  chain,
  aggregateStats,
  onSelectRequest,
  onBack,
}: ChainViewProps): React.ReactElement {
  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-2.5">
        <BackButton onClick={onBack} />
        <div className="flex-1">
          <RequestPicker requests={requests} selectedId={selectedId} onSelect={onSelectRequest} />
        </div>
      </div>

      {/* Two-column: pipeline + context */}
      {chain && selectedRequest ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
          <Pipeline chain={chain} />
          <div className="xl:sticky xl:top-0 xl:self-start">
            <ChainContext request={selectedRequest} chain={chain} aggregateStats={aggregateStats} />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-16">
          <EmptyState
            icon={Unlink}
            heading="No request selected"
            description="Pick a request above to see its middleware pipeline."
          />
        </div>
      )}
    </div>
  );
}

// ── Back button ─────────────────────────────────────────────────────────────

function BackButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 transition-all",
        "border-border-subtle/60 bg-card/30 text-muted-foreground",
        "hover:border-border-subtle hover:bg-card/60 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-brand/40",
      )}
    >
      <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
      <span className="text-body-sm font-medium">Aggregate</span>
    </button>
  );
}
