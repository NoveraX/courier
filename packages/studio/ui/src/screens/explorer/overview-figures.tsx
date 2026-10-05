import type { LucideIcon } from "lucide-react";
import { CircleAlert, Folder, HeartPulse, Radio, Server, Zap } from "lucide-react";

import { FigureGrid } from "@/design/figure-grid";
import type { OverviewFigure } from "@/features/explorer/overview-model";

const ICONS: Readonly<Record<OverviewFigure["key"], LucideIcon>> = {
  sources: Server,
  groups: Folder,
  endpoints: Zap,
  active: Radio,
  healthy: HeartPulse,
  errors: CircleAlert,
};

/**
 * The Overview's six figures: sources, groups, endpoints, those active
 * now, the share healthy, and the error rate.
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
    <FigureGrid
      label="Figures"
      figures={figures.map((figure) => ({ ...figure, icon: ICONS[figure.key] }))}
    />
  );
}
