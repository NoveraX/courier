import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";

import type { HistogramBucket } from "./types";
import { HISTOGRAM_CHART_CONFIG } from "./constants";

interface ResponseTimeChartProps {
  data: HistogramBucket[];
}

export function ResponseTimeChart({ data }: ResponseTimeChartProps): React.ReactElement {
  return (
    <ChartContainer config={HISTOGRAM_CHART_CONFIG} className="h-[200px] w-full">
      <BarChart data={data} barGap={2}>
        <CartesianGrid
          vertical={false}
          strokeDasharray="3 3"
          strokeOpacity={0.1}
        />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
        />
        <YAxis hide />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const item = payload[0]?.payload as HistogramBucket | undefined;
                return item?.range ?? "";
              }}
            />
          }
        />
        <Bar
          dataKey="success"
          stackId="a"
          fill="var(--color-success)"
          radius={[0, 0, 0, 0]}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Bar
          dataKey="error"
          stackId="a"
          fill="var(--color-error)"
          radius={[3, 3, 0, 0]}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
      </BarChart>
    </ChartContainer>
  );
}
