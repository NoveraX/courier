import { SSE_CONTROL_EVENTS } from "../realtime/sse/control-events";
import type { SSERegistryEntry } from "./sse-registry";

/**
 * The notice a stream gets when its server is going away.
 *
 * It is a control event, not one of the endpoint's: named `courier:shutdown`
 * so the client does not hand it to the app as though the endpoint had sent
 * it, and left unnumbered so a reconnecting client resumes from the last
 * event the stream sent, not from the notice.
 *
 * @param retryMs - How long the client waits before it reconnects
 * @returns The notice, as it goes on the wire
 * @example
 * ```ts
 * formatShutdownNotice(3000);
 * // → "event: courier:shutdown\nretry: 3000\ndata: null\n\n"
 * ```
 */
export function formatShutdownNotice(retryMs: number): string {
  return `event: ${SSE_CONTROL_EVENTS.shutdown}\nretry: ${Math.max(0, Math.trunc(retryMs))}\ndata: null\n\n`;
}

/** Send shutdown notice to all entries, abort signal, wait for drain, force-close stragglers */
export async function executeSSEShutdown(
  entries: Map<string, SSERegistryEntry>,
  shutdownController: AbortController,
  options?: { retryMs?: number; drainMs?: number },
): Promise<void> {
  const retryMs = options?.retryMs ?? 3000;
  const drainMs = options?.drainMs ?? 2000;

  const notice = formatShutdownNotice(retryMs);

  // Snapshot to avoid concurrent modification. Best-effort: queued even into
  // a full buffer, as it is the last thing the stream says.
  for (const entry of [...entries.values()]) {
    entry.notify(notice);
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
