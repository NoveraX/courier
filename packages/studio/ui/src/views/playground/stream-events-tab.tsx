import { Radio } from "lucide-react";

import { getSocket } from "@/socket";
import { useStudioStore } from "@/store";
import { StreamTab } from "@/components/shared/detail-panel/tabs/stream-tab";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import { WSComposePanel } from "./ws-compose-panel";

/** Thin wrapper — resolves RequestEntry from store, delegates to shared StreamTab */
export function StreamEventsTab({ entry }: { entry: PlaygroundHistoryEntry }): React.ReactElement {
  const storeEntry = useStudioStore((s) =>
    entry.serverRequestId ? s.requests.find((r) => r.id === entry.serverRequestId) : undefined,
  );

  if (!storeEntry) {
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
        <StreamTab request={storeEntry} />
      </div>
      {isWs && (
        <WSComposePanel
          disabled={!isActive}
          onSend={(data) => sendWSMessage(entry.serverRequestId!, entry.source, entry.group, entry.method, data)}
        />
      )}
    </div>
  );
}

function sendWSMessage(requestId: string, source: string, group: string, method: string, data: unknown): void {
  const topic = `${source}.${group}.${method}#playground`;
  getSocket().emit("playground:ws:send", { requestId, topic, data }, (result: { ok: boolean; error?: string }) => {
    if (!result.ok) console.warn("[ws:send]", result.error);
  });
}
