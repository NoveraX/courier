import { cn } from "@/lib/utils";
import type { AnswerMark } from "./answer-mark";
import type { PaneView } from "./pane-switch";
import { PaneSwitch } from "./pane-switch";

/** How the panes share the screen: side by side, or one at a time. */
export type PanesLayout = "auto" | "split" | "single";

const LAYOUT: Readonly<Record<Exclude<PanesLayout, "single">, string>> = {
  auto: "grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] max-[900px]:auto-rows-[minmax(420px,auto)] max-[900px]:grid-cols-1 max-[900px]:overflow-auto",
  split: "grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] divide-x divide-line",
};

interface PlaygroundPanesProps {
  /**
   * `auto` puts the panes side by side and stacks them on a narrow window;
   * `split` keeps them side by side on a screen too short to stack them;
   * `single` shows one at a time under a switch, as on a phone.
   */
  layout: PanesLayout;
  view: PaneView;
  onView: (view: PaneView) => void;
  /** How the run shown went, which the switch marks. */
  mark: AnswerMark | undefined;
  request: React.ReactNode;
  response: React.ReactNode;
}

/**
 * The Playground's request and response panes. One at a time, both stay
 * drawn, so a pane keeps its scroll and its open nodes while the other
 * shows.
 *
 * @param props - The layout, the pane shown and what shows the other, how the run shown went, and the two panes
 * @returns The panes
 * @example
 * ```tsx
 * <PlaygroundPanes layout="auto" view={view} onView={setView} mark={undefined} request={request} response={response} />
 * ```
 */
export function PlaygroundPanes(props: PlaygroundPanesProps): React.ReactNode {
  const { layout, view, onView, mark, request, response } = props;
  if (layout !== "single") {
    return (
      <div className={cn("grid min-h-0 flex-1", LAYOUT[layout])}>
        {request}
        {response}
      </div>
    );
  }
  return (
    <>
      <PaneSwitch view={view} onView={onView} mark={mark} />
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]">
        <div className={view === "request" ? "contents" : "hidden"}>{request}</div>
        <div className={view === "response" ? "contents" : "hidden"}>{response}</div>
      </div>
    </>
  );
}
