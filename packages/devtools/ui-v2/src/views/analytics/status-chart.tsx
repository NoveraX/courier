import { Cell, Label, Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

import { STATUS_CHART_CONFIG } from "./constants";
import type { StatusSlice } from "./types";

interface StatusChartProps {
  data: StatusSlice[];
  total: number;
}

export function StatusChart({ data, total }: StatusChartProps): React.ReactElement {
  return (
    <ChartContainer config={STATUS_CHART_CONFIG} className="h-[200px] w-full">
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="tabular-nums">
                  {name}: <strong>{String(value)}</strong>
                </span>
              )}
            />
          }
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="60%"
          outerRadius="90%"
          paddingAngle={2}
          animationDuration={800}
          animationEasing="ease-out"
        >
          {data.map((slice) => (
            <Cell key={slice.name} fill={slice.fill} stroke="none" />
          ))}
          <Label content={<CenterLabel total={total} />} />
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
      </PieChart>
    </ChartContainer>
  );
}

// ── Center label ─────────────────────────────────────────────────────────────

function CenterLabel({ total, viewBox }: {
  total: number;
  viewBox?: { cx?: number; cy?: number };
}): React.ReactElement {
  const cx = viewBox?.cx ?? 0;
  const cy = viewBox?.cy ?? 0;

  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
      <tspan
        x={cx}
        dy="-0.4em"
        className="fill-foreground text-xl font-semibold tabular-nums"
      >
        {total.toLocaleString()}
      </tspan>
      <tspan
        x={cx}
        dy="2em"
        className="fill-muted-foreground text-[10px] uppercase tracking-wider"
      >
        Requests
      </tspan>
    </text>
  );
}
