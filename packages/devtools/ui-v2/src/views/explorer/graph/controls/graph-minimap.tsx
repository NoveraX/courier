import { MiniMap } from "@xyflow/react";
import type { Node } from "@xyflow/react";

// ── Minimap color function ───────────────────────────────────────────────────

function minimapNodeColor(node: Node): string {
  switch (node.type) {
    case "source": return "oklch(0.65 0.18 280)";
    case "group": return "oklch(0.50 0.12 310)";
    case "endpoint": return "oklch(0.50 0.10 230)";
    default: return "oklch(0.40 0 0)";
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function GraphMinimap(): React.ReactElement {
  return (
    <MiniMap
      nodeColor={minimapNodeColor}
      maskColor="oklch(0.10 0 0 / 0.7)"
      pannable
      zoomable
      position="bottom-right"
      className="!rounded-lg !border !border-border-subtle !bg-card/80 !backdrop-blur-md"
    />
  );
}
