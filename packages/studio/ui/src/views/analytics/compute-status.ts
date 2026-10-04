import type { RequestEntry } from "@/store/types";
import type { StatusSlice } from "./types";

const OTHER_COLOR = "var(--muted-foreground)";

const STATUS_COLORS: Record<string, string> = {
  "2xx": "var(--chart-2)",
  "3xx": "var(--chart-5)",
  "4xx": "var(--chart-3)",
  "5xx": "var(--chart-7)",
  Error: "var(--destructive-foreground)",
  Other: OTHER_COLOR,
};

export function computeStatusBreakdown(requests: RequestEntry[]): StatusSlice[] {
  const completed = requests.filter((r) => r.status !== "pending");
  const map = new Map<string, number>();

  for (const r of completed) {
    const code = r.statusCode
      ? `${Math.floor(r.statusCode / 100)}xx`
      : r.status === "error"
        ? "Error"
        : "Other";
    map.set(code, (map.get(code) ?? 0) + 1);
  }

  return Array.from(map, ([name, value]) => ({
    name,
    value,
    fill: STATUS_COLORS[name] ?? OTHER_COLOR,
  })).sort((a, b) => b.value - a.value);
}
