import { recentCalls } from "@/features/explorer/endpoint-detail";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { CallRow } from "@/request-list/call-row";

interface EndpointCallsProps {
  endpoint: EndpointNode;
  slowMs: number;
  onOpen: (id: string) => void;
}

/**
 * An endpoint's newest calls — when, how each went, its status and how
 * long it took against the others — each opening in the inspector.
 *
 * @param props - The endpoint, the slow threshold, and what opens a call
 * @returns The list
 * @example
 * ```tsx
 * <EndpointCalls endpoint={endpoint} slowMs={500} onOpen={open} />
 * ```
 */
export function EndpointCalls({ endpoint, slowMs, onOpen }: EndpointCallsProps): React.ReactNode {
  const calls = recentCalls(endpoint);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-label font-semibold text-fg-muted">Recent calls</h3>
        {calls.length > 0 && <span className="text-label text-fg-subtle">click to inspect</span>}
      </div>
      <div className="overflow-hidden rounded-panel border border-line">
        {calls.length === 0 && (
          <p className="px-3 py-5.5 text-center text-control text-fg-subtle">
            Not called in this session yet
          </p>
        )}
        {calls.map((call) => (
          <CallRow
            key={call.request.id}
            call={call}
            slowMs={slowMs}
            onOpen={onOpen}
            className="h-8 border-b border-line px-3 last:border-b-0 hover:bg-raised"
          />
        ))}
      </div>
    </div>
  );
}
