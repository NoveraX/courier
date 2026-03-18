/**
 * Preview view — shows what the manage operation will change on disk.
 */

import { AlertTriangle, FilePlus, FileMinus, FileEdit } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import type { ManagePreviewResult } from "./types";

interface ManagePreviewProps {
  preview: ManagePreviewResult;
}

export function ManagePreviewView({ preview }: ManagePreviewProps): React.ReactElement {
  const { addResult, removeResult } = preview;
  const warnings = removeResult?.modifiedEndpointsWarning ?? [];

  return (
    <div className="space-y-4 pt-2">
      {/* Warnings */}
      {warnings.length > 0 && (
        <>
          <WarningSection warnings={warnings} />
          <Separator />
        </>
      )}

      {/* Added files */}
      {addResult && addResult.files.length > 0 && (
        <FileSection
          title="Files to create / modify"
          files={addResult.files.map((f) => ({
            path: f.path,
            action: f.action,
          }))}
        />
      )}

      {/* Modified files from removal */}
      {removeResult && removeResult.modifiedFiles.length > 0 && (
        <FileSection
          title="Files modified by removal"
          files={removeResult.modifiedFiles.map((f) => ({
            path: f.path,
            action: "modify" as const,
          }))}
        />
      )}

      {/* Deleted files */}
      {removeResult && removeResult.deletedFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground">Files to delete</h4>
          {removeResult.deletedFiles.map((path) => (
            <FileRow key={path} path={path} action="delete" />
          ))}
        </div>
      )}

      {/* Orphaned schemas */}
      {removeResult && removeResult.orphanedSchemas.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold text-muted-foreground">Orphaned schemas removed</h4>
          <div className="flex flex-wrap gap-1">
            {removeResult.orphanedSchemas.map((name) => (
              <Badge key={name} variant="secondary" className="text-[10px]">{name}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <SummaryBar addResult={addResult} removeResult={removeResult} />
    </div>
  );
}

// ── Warning section ──────────────────────────────────────────────────────────

function WarningSection({ warnings }: { warnings: string[] }): React.ReactElement {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-3.5 text-amber-400" />
        <span className="text-xs font-semibold text-amber-300">
          Modified endpoints will be permanently deleted
        </span>
      </div>
      <ul className="space-y-0.5 pl-6">
        {warnings.map((name) => (
          <li key={name} className="text-xs text-amber-300/80 font-mono">{name}</li>
        ))}
      </ul>
    </div>
  );
}

// ── File section ─────────────────────────────────────────────────────────────

function FileSection({ title, files }: {
  title: string;
  files: Array<{ path: string; action: "create" | "modify" }>;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-foreground">{title}</h4>
      {files.map((f) => (
        <FileRow key={f.path} path={f.path} action={f.action} />
      ))}
    </div>
  );
}

function FileRow({ path, action }: {
  path: string;
  action: "create" | "modify" | "delete";
}): React.ReactElement {
  const config = {
    create: { icon: FilePlus, color: "text-emerald-400", label: "new" },
    modify: { icon: FileEdit, color: "text-blue-400", label: "modified" },
    delete: { icon: FileMinus, color: "text-rose-400", label: "deleted" },
  }[action];

  return (
    <div className="flex items-center gap-2 text-xs">
      <config.icon className={`size-3 ${config.color}`} />
      <span className="font-mono text-muted-foreground truncate">{path}</span>
      <Badge variant="secondary" className="text-[9px] ml-auto shrink-0">{config.label}</Badge>
    </div>
  );
}

// ── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ addResult, removeResult }: {
  addResult?: ManagePreviewResult["addResult"];
  removeResult?: ManagePreviewResult["removeResult"];
}): React.ReactElement {
  const created = addResult?.files.filter((f) => f.action === "create").length ?? 0;
  const modified = (addResult?.files.filter((f) => f.action === "modify").length ?? 0)
    + (removeResult?.modifiedFiles.length ?? 0);
  const deleted = removeResult?.deletedFiles.length ?? 0;

  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
      {created > 0 && <span className="text-emerald-400">{created} created</span>}
      {modified > 0 && <span className="text-blue-400">{modified} modified</span>}
      {deleted > 0 && <span className="text-rose-400">{deleted} deleted</span>}
      {created === 0 && modified === 0 && deleted === 0 && <span>No changes</span>}
    </div>
  );
}
