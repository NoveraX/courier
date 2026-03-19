import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { HeaderDiff } from "./types";

interface HeadersDiffProps {
  headers: HeaderDiff[];
}

const ROW_BG: Record<HeaderDiff["status"], string> = {
  equal: "",
  added: "bg-emerald-500/6",
  removed: "bg-rose-500/6",
  changed: "bg-amber-500/6",
};

const STATUS_LABEL: Record<HeaderDiff["status"], { text: string; color: string }> = {
  equal: { text: "", color: "" },
  added: { text: "added", color: "text-emerald-400" },
  removed: { text: "removed", color: "text-rose-400" },
  changed: { text: "changed", color: "text-amber-400" },
};

export function HeadersDiffView({ headers }: HeadersDiffProps): React.ReactElement {
  if (headers.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <p className="text-body-sm text-muted-foreground">No headers to compare</p>
      </div>
    );
  }

  const hasChanges = headers.some((h) => h.status !== "equal");

  if (!hasChanges) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <p className="text-body-sm text-muted-foreground">Headers are identical</p>
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border-subtle text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            <th className="px-3 py-2 text-left w-[200px]">Header</th>
            <th className="px-3 py-2 text-left">Left</th>
            <th className="px-3 py-2 text-left">Right</th>
            <th className="px-3 py-2 text-right w-[80px]">Status</th>
          </tr>
        </thead>
        <tbody>
          {headers.map((h) => (
            <tr
              key={h.key}
              className={cn(
                "border-b border-border-subtle/50 transition-colors",
                ROW_BG[h.status],
              )}
            >
              <td className="px-3 py-1.5 font-mono text-[11px] text-foreground font-medium">
                {h.key}
              </td>
              <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                {h.left ?? <span className="text-muted-foreground/30">&mdash;</span>}
              </td>
              <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                {h.right ?? <span className="text-muted-foreground/30">&mdash;</span>}
              </td>
              <td className="px-3 py-1.5 text-right">
                {h.status !== "equal" && (
                  <span className={cn("text-[10px] font-medium", STATUS_LABEL[h.status].color)}>
                    {STATUS_LABEL[h.status].text}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}
