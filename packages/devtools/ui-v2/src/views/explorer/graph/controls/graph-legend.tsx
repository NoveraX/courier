import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Legend items ──────────────────────────────────────────────────────────────

const NODE_ITEMS = [
  { label: "Source", color: "oklch(0.65 0.18 280)" },
  { label: "Group", color: "oklch(0.50 0.12 310)" },
  { label: "Endpoint", color: "oklch(0.50 0.10 230)" },
] as const;

const EDGE_ITEMS = [
  { label: "Active", dashed: false, color: "oklch(0.65 0.18 280)" },
  { label: "Idle", dashed: true, color: "oklch(0.30 0 0)" },
] as const;

const HEALTH_ITEMS = [
  { label: "Healthy", color: "oklch(0.72 0.15 142)" },
  { label: "Degraded", color: "oklch(0.75 0.17 86)" },
  { label: "Critical", color: "oklch(0.71 0.19 29)" },
  { label: "Inactive", color: "oklch(0.40 0 0)" },
] as const;

// ── Component ────────────────────────────────────────────────────────────────

export function GraphLegend(): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "absolute bottom-3 left-3 z-10 rounded-lg border border-border-subtle",
        "bg-card/80 backdrop-blur-md shadow-lg",
        "text-body-xs transition-all",
      )}
    >
      {/* Toggle header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-foreground"
      >
        <span className="font-medium">Legend</span>
        {collapsed ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </button>

      {/* Collapsible content */}
      {!collapsed && (
        <div className="border-t border-border-subtle px-3 pb-2.5 pt-2 space-y-2">
          {/* Nodes */}
          <LegendSection label="Nodes">
            {NODE_ITEMS.map((item) => (
              <NodeLegendItem key={item.label} {...item} />
            ))}
          </LegendSection>

          {/* Edges */}
          <LegendSection label="Edges">
            {EDGE_ITEMS.map((item) => (
              <EdgeLegendItem key={item.label} {...item} />
            ))}
          </LegendSection>

          {/* Health */}
          <LegendSection label="Health">
            {HEALTH_ITEMS.map((item) => (
              <NodeLegendItem key={item.label} {...item} />
            ))}
          </LegendSection>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function LegendSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <span className="text-caption text-muted-foreground/60">{label}</span>
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">{children}</div>
    </div>
  );
}

function NodeLegendItem({ label, color }: { label: string; color: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function EdgeLegendItem({
  label,
  dashed,
  color,
}: {
  label: string;
  dashed: boolean;
  color: string;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5">
      <svg width="16" height="6" className="shrink-0">
        <line
          x1="0" y1="3" x2="16" y2="3"
          stroke={color}
          strokeWidth={2}
          strokeDasharray={dashed ? "4 2" : "none"}
        />
      </svg>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
