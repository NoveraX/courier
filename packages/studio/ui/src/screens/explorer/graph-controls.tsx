import { Panel, useReactFlow } from "@xyflow/react";
import type { LucideIcon } from "lucide-react";
import { Maximize, Minus, Plus } from "lucide-react";

import { GRAPH_VIEW } from "./graph-view-options";

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
 * @returns The controls, at the graph's lower left
 * @example
 * ```tsx
 * <ReactFlow nodes={nodes}><GraphControls /></ReactFlow>
 * ```
 */
export function GraphControls(): React.ReactNode {
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
          onClick={() => void flow.fitView({ ...GRAPH_VIEW.fit, duration: 240 })}
        />
      </div>
    </Panel>
  );
}
