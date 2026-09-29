import type { Node } from "@xyflow/react";
import { MiniMap } from "@xyflow/react";
import { useMemo } from "react";

// ── Read CSS var at render time (canvas API needs resolved color) ────────────

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function useMinimapColors() {
  return useMemo(() => {
    const source = getCssVar("--graph-node-source-border") || "oklch(0.65 0.18 280)";
    const group = getCssVar("--graph-node-group-border") || "oklch(0.50 0.12 310)";
    const endpoint = getCssVar("--graph-edge-endpoint") || "oklch(0.50 0.10 230)";
    const fallback = getCssVar("--muted-foreground") || "oklch(0.40 0 0)";
    const bg = getCssVar("--graph-bg") || "oklch(0.13 0.01 264)";
    return { source, group, endpoint, fallback, bg };
    // Re-read on theme change via key in parent
  }, []);
}

// ── Component ────────────────────────────────────────────────────────────────

export function GraphMinimap(): React.ReactElement {
  const colors = useMinimapColors();

  const nodeColor = (node: Node): string => {
    switch (node.type) {
      case "source":
        return colors.source;
      case "group":
        return colors.group;
      case "endpoint":
        return colors.endpoint;
      default:
        return colors.fallback;
    }
  };

  return (
    <MiniMap
      nodeColor={nodeColor}
      maskColor={`color-mix(in oklch, ${colors.bg} 70%, transparent)`}
      pannable
      zoomable
      position="bottom-right"
      className="!rounded-lg !border !border-border-subtle !bg-card/80 !backdrop-blur-md"
    />
  );
}
