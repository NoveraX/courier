import { cn } from "@/lib/utils";
import type { AnswerMark } from "./answer-mark";

/** The Playground's two panes, of which a phone shows one at a time. */
export type PaneView = "request" | "response";

const TONE: Readonly<Record<AnswerMark["tone"], string>> = {
  ok: "text-ok",
  err: "text-err",
  warn: "text-warn",
  brand: "text-brand",
  subtle: "text-fg-subtle",
};

const PANES: readonly { view: PaneView; label: string }[] = [
  { view: "request", label: "Request" },
  { view: "response", label: "Response" },
];

interface PaneSwitchProps {
  view: PaneView;
  onView: (view: PaneView) => void;
  /** How the run shown went, marked on the Response side; nothing before a send. */
  mark: AnswerMark | undefined;
}

/**
 * Which of the Playground's panes a phone shows: the request or the
 * response, the response marked with how the run shown went — so an answer
 * is seen to arrive while the request shows.
 *
 * @param props - The pane shown, what shows the other, and how the run shown went
 * @returns The switch
 * @example
 * ```tsx
 * <PaneSwitch view="request" onView={setView} mark={answerMark(shown, row)} />
 * ```
 */
export function PaneSwitch({ view, onView, mark }: PaneSwitchProps): React.ReactNode {
  return (
    <div className="shrink-0 border-b border-line px-4 py-1.5">
      <fieldset
        aria-label="Pane"
        className="m-0 flex min-w-0 gap-0.5 rounded-card border border-line bg-inset p-0.5"
      >
        {PANES.map((pane) => {
          const on = pane.view === view;
          return (
            <button
              key={pane.view}
              type="button"
              aria-pressed={on}
              onClick={() => onView(pane.view)}
              className={cn(
                "flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] text-small font-strong transition-colors focus-visible:outline-2 focus-visible:outline-brand",
                on ? "bg-raised text-fg" : "text-fg-subtle",
              )}
            >
              {pane.label}
              {pane.view === "response" && mark && (
                <span className={cn("font-mono text-meta font-medium", TONE[mark.tone])}>
                  {mark.text}
                </span>
              )}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
