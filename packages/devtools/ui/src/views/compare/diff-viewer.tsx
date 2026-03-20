import { useMemo } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";

import type { DiffLine } from "./types";
import { DiffRow, CollapsedRegion } from "./diff-row";

interface DiffViewerProps {
  lines: DiffLine[];
  leftLabel: string;
  rightLabel: string;
}

/** Minimum consecutive equal lines before collapsing */
const COLLAPSE_THRESHOLD = 4;

interface DiffRegion {
  type: "diff" | "collapsed";
  lines: DiffLine[];
}

function groupRegions(lines: DiffLine[]): DiffRegion[] {
  const regions: DiffRegion[] = [];
  let equalBuf: DiffLine[] = [];

  const flushEqual = (): void => {
    if (equalBuf.length === 0) return;
    if (equalBuf.length > COLLAPSE_THRESHOLD) {
      regions.push({ type: "diff", lines: [equalBuf[0]] });
      regions.push({ type: "collapsed", lines: equalBuf.slice(1, -1) });
      regions.push({ type: "diff", lines: [equalBuf[equalBuf.length - 1]] });
    } else {
      regions.push({ type: "diff", lines: equalBuf });
    }
    equalBuf = [];
  };

  for (const line of lines) {
    if (line.type === "equal") {
      equalBuf.push(line);
    } else {
      flushEqual();
      const last = regions[regions.length - 1];
      if (last && last.type === "diff") {
        last.lines.push(line);
      } else {
        regions.push({ type: "diff", lines: [line] });
      }
    }
  }

  flushEqual();
  return regions;
}

export function DiffViewer({
  lines,
  leftLabel,
  rightLabel,
}: DiffViewerProps): React.ReactElement {
  const regions = useMemo(() => groupRegions(lines), [lines]);
  const hasChanges = lines.some((l) => l.type !== "equal");

  if (lines.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <p className="text-body-sm text-muted-foreground">No data to compare</p>
      </div>
    );
  }

  if (!hasChanges) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <p className="text-body-sm text-muted-foreground">Content is identical</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Column headers */}
      <div className="flex shrink-0 border-b border-border-subtle text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        <div className="flex-1 px-3 py-1.5">{leftLabel}</div>
        <div className="w-px bg-border-subtle" />
        <div className="flex-1 px-3 py-1.5">{rightLabel}</div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="font-mono text-[11px] leading-5">
          {regions.map((region, ri) =>
            region.type === "collapsed" ? (
              <CollapsedRegion key={ri} lines={region.lines} />
            ) : (
              region.lines.map((line, li) => (
                <DiffRow key={`${ri}-${li}`} line={line} />
              ))
            ),
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
