import type { SSERegistryEntry } from "./sse-registry";
import type { SSEBroadcastEvent } from "./sse-types";

/** Send shutdown event to all entries, abort signal, wait for drain, force-close stragglers */
export async function executeSSEShutdown(
  entries: Map<string, SSERegistryEntry>,
  shutdownController: AbortController,
  sendTo: (entry: SSERegistryEntry, event: SSEBroadcastEvent, mayDrop: boolean) => boolean,
  options?: { retryMs?: number; drainMs?: number },
): Promise<void> {
  const retryMs = options?.retryMs ?? 3000;
  const drainMs = options?.drainMs ?? 2000;

  const shutdownEvent = { event: "shutdown", data: { reason: "shutdown" }, retry: retryMs };

  // Snapshot to avoid concurrent modification
  const snapshot = [...entries.values()];

  // Best-effort: send shutdown event to all active streams
  for (const entry of snapshot) {
    sendTo(entry, shutdownEvent, false);
  }

  // Brief pause to let TCP flush the event
  await new Promise((r) => setTimeout(r, Math.min(drainMs, 100)));

  // Abort the shared shutdown signal — fires all composed signals
  shutdownController.abort();

  // Wait for streams to close naturally, then force remaining
  const deadline = Date.now() + drainMs;
  while (entries.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }

  // Force-close any stragglers (stuck generators)
  for (const entry of [...entries.values()]) {
    entry.abort();
  }
  entries.clear();
}
