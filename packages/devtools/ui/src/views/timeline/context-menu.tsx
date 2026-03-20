import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Copy, Code, FileJson, Pin, PinOff, RotateCcw, Download } from "lucide-react";
import { toast } from "sonner";

import type { RequestEntry } from "@/store/types";
import { useDevToolsStore } from "@/store";
import { buildCurl, buildFetchSnippet, buildRequestJson } from "@/components/shared/detail-panel";

interface RequestContextMenuProps {
  request: RequestEntry;
  children: React.ReactNode;
}

export function RequestContextMenu({
  request,
  children,
}: RequestContextMenuProps): React.ReactElement {
  const togglePin = useDevToolsStore((s) => s.togglePin);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={() => copyToClipboard(buildCurl(request), "cURL")}>
          <Copy className="mr-2 size-3.5" />
          Copy as cURL
        </ContextMenuItem>
        <ContextMenuItem onClick={() => copyToClipboard(buildFetchSnippet(request), "fetch")}>
          <Code className="mr-2 size-3.5" />
          Copy as fetch
        </ContextMenuItem>
        <ContextMenuItem onClick={() => copyToClipboard(buildRequestJson(request), "JSON")}>
          <FileJson className="mr-2 size-3.5" />
          Copy as JSON
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => downloadJson(request)}>
          <Download className="mr-2 size-3.5" />
          Download JSON
        </ContextMenuItem>
        <ContextMenuItem disabled>
          <RotateCcw className="mr-2 size-3.5" />
          Replay request
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => togglePin(request.id)}>
          {request.pinned ? (
            <>
              <PinOff className="mr-2 size-3.5" />
              Unpin
            </>
          ) : (
            <>
              <Pin className="mr-2 size-3.5" />
              Pin request
            </>
          )}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

async function copyToClipboard(text: string, label: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  toast.success(`Copied as ${label}`);
}

function downloadJson(request: RequestEntry): void {
  const json = buildRequestJson(request);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${request.source}-${request.method}-${request.id.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
