import type { FitViewOptions } from "@xyflow/react";
import { Panel, useReactFlow } from "@xyflow/react";
import type { LucideIcon } from "lucide-react";
import { Maximize, Minus, Plus } from "lucide-react";

/* The flow's margin around a panel, and the gap a fit keeps from a node. */
const PANEL_MARGIN = 15;
const GAP = 8;

/* Three buttons in a bordered column: 28 px each with a mouse, 40 with a finger. */
function roomFor(button: number): { width: number; height: number } {
  return { width: PANEL_MARGIN + button + 2 + GAP, height: PANEL_MARGIN + 3 * button + 2 + GAP };
}

/**
 * The room the controls take from the graph's lower left corner, with a
 * mouse and with a finger, the panel's margin and a gap before a node
 * included — what a fit keeps clear of the graph.
 */
export const CONTROLS_ROOM = { fine: roomFor(28), coarse: roomFor(40) } as const;

function Control({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}): React.ReactNode {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex size-7 cursor-pointer items-center justify-center border-b border-line text-fg-muted transition-colors last:border-b-0 hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand pointer-coarse:size-10"
    >
      <Icon aria-hidden="true" className="size-3.5 pointer-coarse:size-4" />
    </button>
  );
}

/**
 * Zoom in, zoom out, and fit the whole graph back in view — beside the
 * pan and zoom a trackpad, a mouse, a finger or the keyboard gives — each
 * a finger's size on a touch screen.
 *
 * @param props - The fit the graph was first shown with, which the fit button repeats
 * @returns The controls, at the graph's lower left
 * @example
 * ```tsx
 * <ReactFlow nodes={nodes}><GraphControls fit={fit} /></ReactFlow>
 * ```
 */
export function GraphControls({ fit }: { fit: FitViewOptions }): React.ReactNode {
  const flow = useReactFlow();
  return (
    <Panel position="bottom-left">
      <div className="flex flex-col overflow-hidden rounded-card border border-line bg-panel shadow-overlay">
        <Control icon={Plus} label="Zoom in" onClick={() => void flow.zoomIn({ duration: 160 })} />
        <Control
          icon={Minus}
          label="Zoom out"
          onClick={() => void flow.zoomOut({ duration: 160 })}
        />
        <Control
          icon={Maximize}
          label="Fit the graph"
          onClick={() => void flow.fitView({ ...fit, duration: 240 })}
        />
      </div>
    </Panel>
  );
}
