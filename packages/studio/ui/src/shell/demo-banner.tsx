import { ArrowUpRight } from "lucide-react";

import { demoResetLine } from "@/features/demo/demo-reset-line";
import { isDemoVisitor } from "@/features/demo/is-demo-visitor";
import { useLiveNow } from "@/hooks/use-live-now";
import { useStudioStore } from "@/store";
import { DOCS_URL } from "./nav";

/* The countdown moves in whole minutes. */
const TICK_MS = 15_000;

/**
 * Tells a visitor of a public demo where they are: one project every
 * visitor shares, what to try in it, when it resets, and the way to run
 * Studio on a project of their own.
 *
 * @returns The banner, or nothing outside a demo and for its host
 * @example
 * ```tsx
 * <DemoBanner />
 * ```
 */
export function DemoBanner(): React.ReactNode {
  const info = useStudioStore((s) => s.studioInfo);
  if (!isDemoVisitor(info)) return null;
  const resetsAt = info?.demo?.resetsAt;
  return (
    <aside
      aria-label="Live demo"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-brand/20 bg-brand-dim px-5 py-2.25 text-control"
    >
      <span className="min-w-0 flex-1 text-fg">
        <strong className="font-semibold">Live demo.</strong>{" "}
        <span className="text-fg-muted">
          Everyone here shares one project: send calls from the Playground, slow the mocks down,
          make them fail. <ResetLine key={resetsAt} resetsAt={resetsAt} />
        </span>
      </span>
      <a
        href={`${DOCS_URL}/studio#setup`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-brand hover:underline"
      >
        Run Studio on your project
        <ArrowUpRight aria-hidden="true" className="size-3" />
      </a>
    </aside>
  );
}

/* Keyed by the reset it counts down to, so a demo that reset counts from now, not from the last tick. */
function ResetLine({ resetsAt }: { resetsAt: number | undefined }): React.ReactNode {
  const now = useLiveNow(resetsAt !== undefined, TICK_MS);
  return demoResetLine(resetsAt, now);
}
