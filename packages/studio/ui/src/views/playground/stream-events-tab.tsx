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
 *
 * A WS channel can be written to from the moment it is requested until it
 * ends, whether or not it has sent anything: many answer messages and say
 * nothing first. The runtime holds a message written while the channel is
 * still opening and sends it once it has opened.
 */
export function StreamEventsTab({ entry }: { entry: PlaygroundHistoryEntry }): React.ReactElement {
  const chunks = entry.chunks ?? [];
  const isActive = entry.streamStatus === "streaming" || entry.streamStatus === "connecting";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        {entry.chunksDropped ? (
          <p className="px-3 pt-2 text-body-xs text-muted-foreground/60">
            {entry.chunksDropped} earlier {entry.chunksDropped === 1 ? "event is" : "events are"}{" "}
            not shown; the last {chunks.length} are.
          </p>
        ) : null}
        {chunks.length > 0 ? (
          <PlaygroundStreamList chunks={chunks} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            {isActive && <Radio className="size-4 animate-pulse text-emerald-400" />}
            <p className="text-body-sm text-muted-foreground/60">
              {isActive ? "Waiting for events..." : "No events received"}
            </p>
          </div>
        )}
      </div>
      {entry.transport === "ws" && (
        <WSComposePanel disabled={!isActive} onSend={(data) => sendWSMessage(entry.rid, data)} />
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
