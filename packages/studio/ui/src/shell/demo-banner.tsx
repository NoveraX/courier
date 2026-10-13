import { ArrowUpRight, ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import { demoResetLine } from "@/features/demo/demo-reset-line";
import { isDemoVisitor } from "@/features/demo/is-demo-visitor";
import { useLiveNow } from "@/hooks/use-live-now";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { demoResetPhrase } from "./demo-reset-phrase";
import { DOCS_URL } from "./nav";

/* The countdown moves in whole minutes. */
const TICK_MS = 15_000;

const SETUP_URL = `${DOCS_URL}/studio/overview#install`;

/* A phone, or a phone held sideways, gives the banner a single line. */
const ONE_LINE_ONLY = "max-sm:hidden short-screen:hidden";

const LINK =
  "inline-flex items-center gap-1 font-medium whitespace-nowrap text-brand hover:underline";

/**
 * Tells a visitor of a public demo where they are: one project every
 * visitor shares, what to try in it, when it resets, and the way to run
 * Studio on a project of their own. On a phone, or a phone held sideways,
 * it is a single line — the demo, when it resets, and the way to run
 * Studio — that opens to the rest.
 *
 * @returns The banner, or nothing outside a demo and for its host
 * @example
 * ```tsx
 * <DemoBanner />
 * ```
 */
export function DemoBanner(): React.ReactNode {
  const info = useStudioStore((s) => s.studioInfo);
  const [open, setOpen] = useState(false);
  const details = useId();
  if (!isDemoVisitor(info)) return null;
  const resetsAt = info?.demo?.resetsAt;
  return (
    <aside
      aria-label="Live demo"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-brand/20 bg-brand-dim py-2.25 pr-[max(20px,env(safe-area-inset-right))] pl-[max(20px,env(safe-area-inset-left))] text-control max-sm:px-4 max-sm:py-0 short-screen:py-0"
    >
      <div className="hidden min-w-0 flex-1 items-center gap-3 max-sm:flex short-screen:flex">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={details}
          onClick={() => setOpen(!open)}
          className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-1 text-left focus-visible:outline-2 focus-visible:outline-brand"
        >
          <span className="truncate text-fg">
            <strong className="font-semibold">Live demo</strong>{" "}
            <span className="text-fg-muted">
              · <ResetText key={resetsAt} resetsAt={resetsAt} phrase={demoResetPhrase} />
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-3 shrink-0 text-fg-muted transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        <a
          href={SETUP_URL}
          target="_blank"
          rel="noreferrer"
          className={cn(LINK, "min-h-9 shrink-0")}
        >
          Run your own
          <ArrowUpRight aria-hidden="true" className="size-3" />
        </a>
      </div>
      <span
        id={details}
        className={cn(
          "min-w-0 flex-1 text-fg max-sm:basis-full max-sm:pb-2.5 short-screen:basis-full short-screen:pb-2.5",
          !open && ONE_LINE_ONLY,
        )}
      >
        <strong className={cn("font-semibold", ONE_LINE_ONLY)}>Live demo.</strong>{" "}
        <span className="text-fg-muted">
          Everyone here shares one project: send calls from the Playground, slow the mocks down,
          make them fail.
          <span className={ONE_LINE_ONLY}>
            {" "}
            <ResetText key={resetsAt} resetsAt={resetsAt} phrase={demoResetLine} />
          </span>
        </span>
      </span>
      <a href={SETUP_URL} target="_blank" rel="noreferrer" className={cn(LINK, ONE_LINE_ONLY)}>
        Run Studio on your project
        <ArrowUpRight aria-hidden="true" className="size-3" />
      </a>
    </aside>
  );
}

interface ResetTextProps {
  resetsAt: number | undefined;
  phrase: (resetsAt: number | undefined, now: number) => string;
}

/* Keyed by the reset it counts down to, so a demo that reset counts from now, not from the last tick. */
function ResetText({ resetsAt, phrase }: ResetTextProps): React.ReactNode {
  const now = useLiveNow(resetsAt !== undefined, TICK_MS);
  return phrase(resetsAt, now);
}
