import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { TIME_SERIES_CHART_CONFIG } from "./constants";
import type { TimeSeriesBucket } from "./types";

interface RequestsOverTimeProps {
  data: TimeSeriesBucket[];
}

export function RequestsOverTimeChart({ data }: RequestsOverTimeProps): React.ReactElement {
  return (
    <ChartContainer config={TIME_SERIES_CHART_CONFIG} className="h-[200px] w-full">
      <AreaChart data={data}>
        <defs>
          <GradientDef id="fillSuccess" color="var(--color-success)" />
          <GradientDef id="fillError" color="var(--color-error)" />
          <GradientDef id="fillPending" color="var(--color-pending)" />
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          interval="preserveStartEnd"
        />
        <YAxis hide />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          type="monotone"
          dataKey="success"
          stackId="1"
          stroke="var(--color-success)"
          fill="url(#fillSuccess)"
          strokeWidth={1.5}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Area
          type="monotone"
          dataKey="error"
          stackId="1"
          stroke="var(--color-error)"
          fill="url(#fillError)"
          strokeWidth={1.5}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Area
          type="monotone"
          dataKey="pending"
          stackId="1"
          stroke="var(--color-pending)"
          fill="url(#fillPending)"
          strokeWidth={1.5}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
      </AreaChart>
    </ChartContainer>
  );
}

// ── Gradient definition ──────────────────────────────────────────────────────

function GradientDef({ id, color }: { id: string; color: string }): React.ReactElement {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={0.4} />
      <stop offset="100%" stopColor={color} stopOpacity={0.05} />
    </linearGradient>
  );
}
