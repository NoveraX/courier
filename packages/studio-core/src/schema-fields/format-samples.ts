const UUID = "00000000-0000-4000-8000-000000000000";
const MOMENT = "2026-01-01T00:00:00Z";

/**
 * A string each format's check takes, by the name a vendor gives the
 * format: Zod's, Valibot's actions, JSON Schema's `format`. The vendors
 * name their formats apart — Valibot's `iso_time` is `hh:mm`, Zod's `time`
 * has seconds — so each name has the sample its own check takes.
 *
 * @example
 * ```ts
 * FORMAT_SAMPLES.get("email"); // "name@example.com"
 * ```
 */
export const FORMAT_SAMPLES: ReadonlyMap<string, string> = new Map([
  ["email", "name@example.com"],
  ["url", "https://example.com"],
  ["uri", "https://example.com"],
  ["uuid", UUID],
  ["guid", UUID],
  ["datetime", MOMENT],
  ["date-time", MOMENT],
  ["iso_timestamp", MOMENT],
  ["iso_date_time", "2026-01-01T00:00"],
  ["date", "2026-01-01"],
  ["iso_date", "2026-01-01"],
  ["time", "00:00:00"],
  ["iso_time", "00:00"],
  ["iso_time_second", "00:00:00"],
  ["ip", "127.0.0.1"],
  ["ipv4", "127.0.0.1"],
  ["ipv6", "::1"],
]);
