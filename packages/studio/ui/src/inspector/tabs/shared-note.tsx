import { Link2 } from "lucide-react";

import { useInspector } from "@/inspector/use-inspector";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";

const SAID = {
  flight:
    "It sent no request of its own: it joined the identical read already in flight, and that call's request answered both.",
  render:
    "It sent no request: the render it was made in had read this already, and that read's answer came back to it.",
} as const;

/**
 * What a call whose read another call's request answered says first: that
 * it sent no request of its own, how it was answered, and — while Studio
 * keeps it — the call whose request answered, one click away.
 *
 * @param props - The call
 * @returns The note, or nothing for a call that sent its own request
 * @example
 * ```tsx
 * <SharedNote request={request} />
 * ```
 */
export function SharedNote({ request }: { request: RequestEntry }): React.ReactNode {
  const leaderId = request.shared?.with;
  const kept = useStudioStore((s) =>
    leaderId === undefined ? false : s.requests.some((r) => r.id === leaderId),
  );
  const { open } = useInspector();
  if (!request.shared) return null;
  return (
    <div
      role="note"
      className="flex items-center gap-2.5 rounded-panel border border-line bg-panel-subtle py-2 pr-2 pl-3 text-small text-fg-muted"
    >
      <Link2 aria-hidden="true" className="size-3.25 shrink-0 text-fg-subtle" />
      <span className="min-w-0 flex-1">{SAID[request.shared.by]}</span>
      {leaderId !== undefined && kept && (
        <button
          type="button"
          onClick={() => open(leaderId)}
          className="flex h-6.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] border border-line-strong bg-panel px-2.5 text-label font-strong whitespace-nowrap text-fg-muted transition-colors hover:text-fg pointer-coarse:h-9"
        >
          Open that call
        </button>
      )}
    </div>
  );
}
