import { useState } from "react";
import {
  MoreHorizontal,
  Download,
  Upload,
  Trash2,
  FileJson,
  FileText,
  FileCode,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { formatDuration, formatRelativeTime } from "@/components/shared/formatters";
import { useDevToolsStore } from "@/store";
import { useNow } from "@/hooks/use-tick";

import type { ExportFormat } from "@/store/types";
import { ConfirmDialog } from "./confirm-dialog";

// ── Session card ─────────────────────────────────────────────────────────────

interface SessionCardProps {
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

function SessionInfo({
  session,
}: {
  session: SessionCardProps["session"];
}): React.ReactElement {
  const now = useNow();
  return (
    <div className="min-w-0 flex-1">
      <p className="text-body-sm font-medium text-foreground truncate">
        {session.name}
      </p>
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

function SessionActions({
  session,
  onLoad,
  onExport,
  onRequestDelete,
}: {
  session: SessionCardProps["session"];
  onLoad: (id: string) => void;
  onExport: (id: string, format: ExportFormat) => void;
  onRequestDelete: () => void;
}): React.ReactElement {
  const defaultFormat = useDevToolsStore((s) => s.settings.defaultExportFormat);

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {session.stats.errorCount > 0 && (
        <Badge variant="destructive" className="text-[10px]">
          {session.stats.errorCount} errors
        </Badge>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Session options" className="size-7">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onLoad(session.id)}>
            <Upload className="mr-2 size-3.5" />
            Load session
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport(session.id, defaultFormat)}>
            <Download className="mr-2 size-3.5" />
            Export as {defaultFormat.toUpperCase()}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Download className="mr-2 size-3.5" />
              Export as...
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => onExport(session.id, "har")}>
                <FileText className="mr-2 size-3.5" />
                HAR
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport(session.id, "json")}>
                <FileJson className="mr-2 size-3.5" />
                JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport(session.id, "postman")}>
                <FileCode className="mr-2 size-3.5" />
                Postman
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={onRequestDelete}
          >
            <Trash2 className="mr-2 size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
