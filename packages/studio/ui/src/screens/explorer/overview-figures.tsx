import type { LucideIcon } from "lucide-react";
import { CircleAlert, Folder, HeartPulse, Radio, Server, Zap } from "lucide-react";

import { TONE_TEXT } from "@/design/tone";
import type { OverviewFigure } from "@/features/explorer/overview-model";
import { cn } from "@/lib/utils";

const ICONS: Readonly<Record<OverviewFigure["key"], LucideIcon>> = {
  sources: Server,
  groups: Folder,
  endpoints: Zap,
  active: Radio,
  healthy: HeartPulse,
  errors: CircleAlert,
};

/**
 * The Overview's six figures in one grid: sources, groups, endpoints,
 * those active now, the share healthy, and the error rate.
 *
 * @param props - The figures
 * @returns The grid
 * @example
 * ```tsx
 * <OverviewFigures figures={overviewFigures(model, requests, "courier.config.ts")} />
 * ```
 */
export function OverviewFigures({
  figures,
}: {
  figures: readonly OverviewFigure[];
}): React.ReactNode {
  return (
    <section
      aria-label="Figures"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-sheet border border-line bg-line min-[701px]:grid-cols-3 min-[1360px]:grid-cols-6"
    >
      {figures.map((figure) => {
        const Icon = ICONS[figure.key];
        return (
          <div key={figure.key} className="flex min-w-0 flex-col gap-2 bg-panel px-4 py-3.5">
            <span className="flex items-center gap-1.75 text-small whitespace-nowrap text-fg-muted">
              <Icon aria-hidden="true" className="size-3 text-fg-subtle" />
              {figure.label}
            </span>
            <span
              className={cn(
                "font-mono text-kpi leading-none font-medium tracking-[-0.035em] tabular-nums",
                TONE_TEXT[figure.tone],
              )}
            >
              {figure.value}
            </span>
            <span className="truncate text-badge text-fg-subtle">{figure.sub}</span>
          </div>
        );
      })}
    </section>
  );
}
