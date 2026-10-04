import { useState } from "react";
import { useNow } from "@/hooks/use-tick";
import { formatDuration, formatRelativeTime } from "@/lib/formatters";

import type { ExportFormat } from "@/store/types";
import { ConfirmDialog } from "./confirm-dialog";
import { SessionActions } from "./session-actions";

// ── Session card ─────────────────────────────────────────────────────────────

export interface SessionCardProps {
  session: {
    id: string;
    name: string;
    savedAt: number;
    duration: number;
    stats: {
      totalRequests: number;
      successCount: number;
      errorCount: number;
      avgDuration: number;
    };
  };
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string, format: ExportFormat) => void;
}

export function SessionCard({
  session,
  onLoad,
  onDelete,
  onExport,
}: SessionCardProps): React.ReactElement {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-border-subtle bg-card px-3 py-2.5">
        <SessionInfo session={session} />
        <SessionActions
          session={session}
          onLoad={onLoad}
          onExport={onExport}
          onRequestDelete={() => setConfirmDelete(true)}
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete session"
        description={`Are you sure you want to delete "${session.name}"? This action cannot be undone.`}
        onConfirm={() => onDelete(session.id)}
      />
    </>
  );
}

// ── Info block ────────────────────────────────────────────────────────────────

function SessionInfo({ session }: { session: SessionCardProps["session"] }): React.ReactElement {
  const now = useNow();
  return (
    <div className="min-w-0 flex-1">
      <p className="text-body-sm font-medium text-foreground truncate">{session.name}</p>
      <div className="mt-0.5 flex items-center gap-2 text-body-xs text-muted-foreground">
        <span>{formatRelativeTime(session.savedAt, now)}</span>
        <span>·</span>
        <span>{session.stats.totalRequests} requests</span>
        <span>·</span>
        <span>{formatDuration(session.duration)}</span>
      </div>
    </div>
  );
}

// ── Actions dropdown ─────────────────────────────────────────────────────────
