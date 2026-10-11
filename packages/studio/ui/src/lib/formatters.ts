const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;

  if (diff < 10 * SECOND) return "just now";
  if (diff < MINUTE) return `${Math.floor(diff / SECOND)}s ago`;
  if (diff < HOUR) return rtf.format(-Math.floor(diff / MINUTE), "minute");
  if (diff < DAY) return rtf.format(-Math.floor(diff / HOUR), "hour");
  return rtf.format(-Math.floor(diff / DAY), "day");
}

export function formatAbsoluteTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

/**
 * A time of day on a 24-hour clock, to the second.
 *
 * @param timestamp - Epoch milliseconds
 * @returns `HH:MM:SS` in the viewer's time zone
 *
 * @example
 * ```ts
 * formatClockTime(Date.parse("2026-09-25T14:03:09")); // → "14:03:09"
 * ```
 */
export function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatTimestamp(
  timestamp: number,
  format: "relative" | "absolute",
  now = Date.now(),
): string {
  return format === "relative" ? formatRelativeTime(timestamp, now) : formatAbsoluteTime(timestamp);
}

export function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < SECOND) return `${ms.toFixed(ms < 10 ? 1 : 0)}ms`;
  if (ms < MINUTE) return `${(ms / SECOND).toFixed(2)}s`;
  return `${Math.floor(ms / MINUTE)}m ${Math.floor((ms % MINUTE) / SECOND)}s`;
}

const SIZE_UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  let unitIndex = 0;
  let size = Math.abs(bytes);

  while (size >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${SIZE_UNITS[unitIndex]}`;
}

export function formatNumber(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatPercent(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen - 1)}…`;
}

/**
 * Names as a sentence lists them, without a serial comma.
 *
 * @param items - The names
 * @returns `a`, `a and b`, or `a, b and c`; empty for none
 * @example
 * ```ts
 * formatList(["lib/sources.ts", "courier.config.ts"]); // → "lib/sources.ts and courier.config.ts"
 * ```
 */
export function formatList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
