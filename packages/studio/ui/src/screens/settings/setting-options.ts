import { Monitor, Moon, Sun } from "lucide-react";

import type { SegmentedOption } from "@/design/segmented";
import type {
  ApisClient,
  ApisGroupBy,
  ExportFormat,
  Theme,
  TimestampFormat,
  ValidationLib,
} from "@/store/types-ui";

/* Choices of a numeric setting are its numbers, written for the segmented control. */
function numbers(pairs: readonly (readonly [number, string])[]): SegmentedOption<string>[] {
  return pairs.map(([value, label]) => ({ value: String(value), label }));
}

export const THEMES: readonly SegmentedOption<Theme>[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

export const RECONNECT_DELAYS = numbers([
  [500, "0.5s"],
  [1000, "1s"],
  [3000, "3s"],
  [5000, "5s"],
  [10000, "10s"],
]);

export const MAX_REQUESTS = numbers([
  [500, "500"],
  [1000, "1k"],
  [2000, "2k"],
  [5000, "5k"],
  [10000, "10k"],
]);

export const SLOW_THRESHOLDS = numbers([
  [200, "200ms"],
  [500, "500ms"],
  [1000, "1s"],
  [2000, "2s"],
  [5000, "5s"],
]);

export const STORAGE_WARNINGS = numbers([
  [250, "250 MB"],
  [500, "500 MB"],
  [1000, "1 GB"],
  [2000, "2 GB"],
]);

export const TIMESTAMPS: readonly SegmentedOption<TimestampFormat>[] = [
  { value: "relative", label: "2s ago" },
  { value: "absolute", label: "14:23:05" },
];

export const INDENTS: readonly SegmentedOption<"2" | "4">[] = [
  { value: "2", label: "2 spaces" },
  { value: "4", label: "4 spaces" },
];

export const EXPORT_FORMATS: readonly SegmentedOption<ExportFormat>[] = [
  { value: "har", label: "HAR" },
  { value: "postman", label: "Postman" },
  { value: "json", label: "JSON" },
];

export const VALIDATIONS: readonly SegmentedOption<ValidationLib>[] = [
  { value: "zod", label: "Zod" },
  { value: "valibot", label: "Valibot" },
  { value: "arktype", label: "ArkType" },
  { value: "none", label: "None" },
];

export const GROUP_BYS: readonly SegmentedOption<ApisGroupBy>[] = [
  { value: "tag", label: "Tag" },
  { value: "path", label: "Path" },
  { value: "single", label: "Single" },
];

export const CLIENTS: readonly SegmentedOption<ApisClient>[] = [
  { value: "direct", label: "Direct" },
  { value: "proxy", label: "Proxy" },
  { value: "both", label: "Both" },
  { value: "none", label: "None" },
];
