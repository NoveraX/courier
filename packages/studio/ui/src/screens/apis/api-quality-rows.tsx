import type { LucideIcon } from "lucide-react";
import { Eye, ShieldAlert, ShieldCheck, Zap } from "lucide-react";

import type { QualityRow } from "@/features/apis/api-card-view";
import { cn } from "@/lib/utils";

const TONE = {
  ok: { bar: "bg-ok", icon: "text-ok", count: "text-fg-muted" },
  warn: { bar: "bg-warn", icon: "text-warn", count: "text-warn" },
  subtle: { bar: "bg-fg-subtle", icon: "text-fg-subtle", count: "text-fg-subtle" },
} as const;

function qualityIcon(row: QualityRow): LucideIcon {
  if (row.kind === "response") return Eye;
  if (row.kind === "variables") return Zap;
  return row.tone === "ok" ? ShieldCheck : ShieldAlert;
}

/**
 * How much of an imported API is typed: a bar a measure — response types,
 * variables types, schemas — with its count of the total and a tip saying
 * what it counts. In a narrow card each measure's name sits over its bar.
 *
 * @param props - The measures
 * @returns The bars
 * @example
 * ```tsx
 * <ApiQualityRows rows={card.quality} />
 * ```
 */
export function ApiQualityRows({ rows }: { rows: readonly QualityRow[] }): React.ReactNode {
  return (
    <div className="@container flex flex-col gap-2">
      {rows.map((row) => {
        const tone = TONE[row.tone];
        const Icon = qualityIcon(row);
        return (
          <div
            key={row.kind}
            title={row.tip}
            className="grid grid-cols-[120px_minmax(0,1fr)_44px] items-center gap-2.5 @max-[260px]:grid-cols-[minmax(0,1fr)_44px] @max-[260px]:gap-y-1"
          >
            <span className="flex items-center gap-1.5 text-label whitespace-nowrap text-fg-muted @max-[260px]:col-span-2">
              <Icon aria-hidden="true" className={cn("size-2.75", tone.icon)} />
              {row.label}
            </span>
            <span className="h-1 overflow-hidden rounded-full bg-raised">
              <span
                className={cn("block h-full rounded-full", tone.bar)}
                style={{ width: `${row.total ? (row.count / row.total) * 100 : 0}%` }}
              />
            </span>
            <span
              className={cn("text-right font-mono text-badge", tone.count)}
            >{`${row.count}/${row.total}`}</span>
          </div>
        );
      })}
    </div>
  );
}
