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
import { useStudioStore } from "@/store";

import type { ExportFormat } from "@/store/types";
import type { SessionCardProps } from "./session-card";

/**
 * A saved session's actions: load it, export it, delete it.
 *
 * @param props - The session and what to call for each action
 * @returns The actions
 *
 * @example
 * ```tsx
 * <SessionActions session={session} onLoad={load} onExport={exportAs} onRequestDelete={ask} />
 * ```
 */
export function SessionActions({
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
  const defaultFormat = useStudioStore((s) => s.settings.defaultExportFormat);

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
