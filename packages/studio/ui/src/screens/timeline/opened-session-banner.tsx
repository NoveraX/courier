import { ChevronDown, FileInput } from "lucide-react";
import { useState } from "react";

import type { SessionEnvironment } from "@/features/sessions/session-environment";
import { environmentLines } from "@/features/sessions/session-environment";
import type { CurrentEnvironment } from "@/features/sessions/use-current-environment";
import { useCurrentEnvironment } from "@/features/sessions/use-current-environment";
import { useBackToLive } from "@/hooks/use-back-to-live";
import { cn } from "@/lib/utils";
import { EnvironmentList } from "@/screens/session-file/environment-list";
import { useStudioStore } from "@/store";

function Comparison({
  recorded,
  mine,
}: {
  recorded: SessionEnvironment;
  mine: CurrentEnvironment;
}): React.ReactNode {
  if (mine.kind === "reading") return <span className="text-fg-subtle">comparing with yours…</span>;
  if (mine.kind === "unknown") {
    return <span className="text-err">cannot compare with yours: {mine.message}</span>;
  }
  const differing = environmentLines(recorded, mine.environment).filter(
    (line) => line.other !== undefined,
  ).length;
  return differing === 0 ? (
    <span className="text-ok">the same environment as yours</span>
  ) : (
    <span className="text-warn">
      {differing} difference{differing === 1 ? "" : "s"} from yours
    </span>
  );
}

/**
 * Over the Timeline while a session opened from a file is shown: where it
 * was recorded — Studio, Node.js, the platform — how its environment
 * differs from this Studio's, line by line when opened, and the way back
 * to the live requests.
 *
 * @returns The banner, or nothing while no session from a file is shown
 * @example
 * ```tsx
 * <OpenedSessionBanner />
 * ```
 */
export function OpenedSessionBanner(): React.ReactNode {
  const recorded = useStudioStore((s) => s.shownSession?.environment);
  const mine = useCurrentEnvironment(recorded !== undefined);
  const backToLive = useBackToLive();
  const [open, setOpen] = useState(false);
  if (!recorded) return null;
  return (
    <section
      aria-label="Opened from a session file"
      className="border-b border-line bg-panel-subtle"
    >
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 px-5 py-1.5 text-small max-sm:px-4">
        <FileInput aria-hidden="true" className="size-3.5 shrink-0 text-brand" />
        <span className="text-fg">Opened from a session file</span>
        <span className="font-mono text-fg-muted">
          {[
            `Studio ${recorded.studio}`,
            recorded.node && `Node.js ${recorded.node}`,
            recorded.platform,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <Comparison recorded={recorded} mine={mine} />
        <span className="flex-1" />
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((shown) => !shown)}
          className="flex h-7 cursor-pointer items-center gap-1 rounded-control px-2 text-fg-muted hover:bg-raised hover:text-fg pointer-coarse:h-9"
        >
          Environment
          <ChevronDown
            aria-hidden="true"
            className={cn("size-3 transition-transform", open && "rotate-180")}
          />
        </button>
        <button
          type="button"
          onClick={backToLive}
          className="flex h-7 cursor-pointer items-center rounded-control border border-line px-2.5 text-fg-muted hover:border-line-strong hover:text-fg pointer-coarse:h-9"
        >
          Back to live
        </button>
      </div>
      {open && (
        <div className="max-h-72 overflow-auto px-5 pt-1 pb-3.5 max-sm:px-4">
          <EnvironmentList
            environment={recorded}
            other={mine.kind === "known" ? mine.environment : undefined}
          />
        </div>
      )}
    </section>
  );
}
