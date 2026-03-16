import { Line, LineChart } from "recharts";
import type { SparklinePoint } from "../use-endpoint-metrics";

// ── Props ────────────────────────────────────────────────────────────────────

interface MiniSparklineProps {
  data: SparklinePoint[];
  color?: string;
  width?: number;
  height?: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export function MiniSparkline({
  data,
  color = "var(--chart-1)",
  width = 56,
  height = 24,
}: MiniSparklineProps): React.ReactElement | null {
  if (data.length < 2) return null;

  return (
    <LineChart width={width} height={height} data={data}>
      <Line
        type="monotone"
        dataKey="value"
        stroke={color}
        strokeWidth={1.5}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}
