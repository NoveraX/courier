import { Radio } from "lucide-react";

import { getSocket } from "@/socket";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import { PlaygroundStreamList } from "./playground-stream-list";
import { WSComposePanel } from "./ws-compose-panel";

/**
 * Stream + WS compose panel for the playground. Reads chunks directly
 * from the entry (accumulated by `appendPlaygroundChunk` via the
 * rid-keyed `playground:chunk` listener) and dispatches bidirectional
 * WS messages via `playground:write { rid, data }`.
 */
export function StreamEventsTab({ entry }: { entry: PlaygroundHistoryEntry }): React.ReactElement {
  const chunks = entry.chunks ?? [];
  const hasEvents = chunks.length > 0;

  if (!hasEvents) {
    const isActive = entry.streamStatus === "streaming" || entry.streamStatus === "connecting";
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8">
        {isActive && <Radio className="size-4 animate-pulse text-emerald-400" />}
        <p className="text-body-sm text-muted-foreground/60">
          {isActive ? "Waiting for events..." : "No events received"}
        </p>
      </div>
    );
  }

  const isWs = entry.transport === "ws";
  const isActive = entry.streamStatus === "streaming";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <PlaygroundStreamList chunks={chunks} />
      </div>
      {isWs && (
        <WSComposePanel
          disabled={!isActive}
          onSend={(data) => sendWSMessage(entry.rid, data)}
        />
      )}
    </div>
  );
}

/**
 * Fire `playground:write { rid, data }` at the Studio server; the router
 * broadcasts to every connected runtime, the owning responder's channel
 * receives the payload, and non-owners silently drop it. Errors surface
 * as `playground:error` on the same rid and flow through the store
 * reducers — no callback is attached to the emit.
 */
function sendWSMessage(rid: string, data: unknown): void {
  getSocket().emit("playground:write", { rid, data });
}
