import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

import type { DiffLine } from "./types";

// ── Line styles ─────────────────────────────────────────────────────────────

const LINE_BG: Record<DiffLine["type"], string> = {
  equal: "",
  added: "bg-emerald-500/8",
  removed: "bg-rose-500/8",
};

const LINE_NUM_COLOR: Record<DiffLine["type"], string> = {
  equal: "text-muted-foreground/40",
  added: "text-emerald-400/60",
  removed: "text-rose-400/60",
};

const PREFIX_COLOR: Record<DiffLine["type"], string> = {
  equal: "text-transparent",
  added: "text-emerald-400",
  removed: "text-rose-400",
};

const LINE_PREFIX: Record<DiffLine["type"], string> = {
  equal: " ",
  added: "+",
  removed: "\u2212",
};

// ── Diff row ────────────────────────────────────────────────────────────────

export function DiffRow({ line }: { line: DiffLine }): React.ReactElement {
  return (
    <div className={cn("flex", LINE_BG[line.type])}>
      {/* Left side */}
      <div className="flex min-w-0 flex-1 items-start">
        <span className={cn("w-8 shrink-0 select-none text-right pr-1.5", LINE_NUM_COLOR[line.type])}>
          {line.lineNum.left ?? ""}
        </span>
        <span className={cn("w-3 shrink-0 select-none text-center", PREFIX_COLOR[line.type])}>
          {line.type === "removed" ? LINE_PREFIX[line.type] : " "}
        </span>
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-2">
          {line.left ?? ""}
        </span>
      </div>

      <div className="w-px shrink-0 bg-border-subtle" />

      {/* Right side */}
      <div className="flex min-w-0 flex-1 items-start">
        <span className={cn("w-8 shrink-0 select-none text-right pr-1.5", LINE_NUM_COLOR[line.type])}>
          {line.lineNum.right ?? ""}
        </span>
        <span className={cn("w-3 shrink-0 select-none text-center", PREFIX_COLOR[line.type])}>
          {line.type === "added" ? LINE_PREFIX[line.type] : " "}
        </span>
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-2">
          {line.right ?? ""}
        </span>
      </div>
    </div>
  );
}

// ── Collapsed region ────────────────────────────────────────────────────────

export function CollapsedRegion({ lines }: { lines: DiffLine[] }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  if (expanded) {
    return (
      <>
        {lines.map((line, i) => (
          <DiffRow key={i} line={line} />
        ))}
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex w-full items-center gap-1.5 bg-muted/30 px-3 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/50 transition-colors"
    >
      {expanded ? (
        <ChevronDown className="size-3" />
      ) : (
        <ChevronRight className="size-3" />
      )}
      {lines.length} unchanged lines
    </button>
  );
}
