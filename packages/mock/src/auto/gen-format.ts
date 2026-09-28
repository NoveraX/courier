import { deterministicHex } from "./gen-helpers";
import { generateDateString } from "./gen-string";

/* Several spellings per format, because libraries disagree: Valibot's
   `isoDateTime` takes minutes only, Zod's `iso.datetime` wants the zone. */
const FORMAT_VALUES = new Map<string, (index: number) => string[]>([
  ["email", (i) => [`user${i}@example.com`]],
  ["url", (i) => [`https://example.com/items/${i}`]],
  ["uuid", (i) => [uuidFor(i)]],
  ["guid", (i) => [uuidFor(i)]],
  ["datetime", (i) => dateTimeSpellings(generateDateString(i))],
  ["date", (i) => [generateDateString(i).slice(0, 10)]],
  ["time", (i) => timeSpellings(generateDateString(i).slice(11, 19))],
  ["ipv4", (i) => [`192.168.${Math.floor(i / 256) % 256}.${i % 256}`]],
  ["ipv6", (i) => [`2001:db8::${(i % 0xffff).toString(16)}`]],
  ["e164", (i) => [`+1555${String(1_000_000 + i).slice(-7)}`]],
  ["cuid", (i) => [`c${deterministicHex(i, 24)}`]],
  ["cuid2", (i) => [`a${deterministicHex(i, 23)}`]],
  ["ulid", (i) => [`0${deterministicHex(i, 25).toUpperCase()}`]],
  ["nanoid", (i) => [deterministicHex(i, 21)]],
]);

/* Shape checks for formats whose schema carries no pattern to test against
   (Zod v3, and Valibot formats checked by a function). */
const FORMAT_SHAPES = new Map<string, RegExp>([
  ["email", /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/],
  ["uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i],
  ["datetime", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?$/],
  ["date", /^\d{4}-\d{2}-\d{2}$/],
  ["time", /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/],
  ["ipv4", /^(\d{1,3}\.){3}\d{1,3}$/],
]);

/**
 * Values in a named string format, most common spelling first.
 *
 * @param format The normalized format name (`email`, `uuid`, `datetime`, ...)
 * @param index  Record index, so each record gets its own value
 * @returns Candidate values, or none for a format with no generator
 * @example
 * ```ts
 * formatValues("date", 1); // ["2025-02-04"]
 * ```
 */
export function formatValues(format: string, index: number): string[] {
  return FORMAT_VALUES.get(format)?.(index) ?? [];
}

/**
 * Whether a value has the shape of a named format. Formats without a shape
 * check pass, and are held to the patterns their schema carries instead.
 *
 * @param format The normalized format name
 * @param value  The value to check
 * @returns `false` only when the value is plainly not in the format
 * @example
 * ```ts
 * matchesFormat("email", "Nickname 1"); // false
 * ```
 */
export function matchesFormat(format: string, value: string): boolean {
  if (format === "url") return URL.canParse(value);
  return FORMAT_SHAPES.get(format)?.test(value) ?? true;
}

/** RFC 4122 version 4 layout, so every `uuid` check accepts it */
function uuidFor(index: number): string {
  const hex = deterministicHex(index, 32);
  const variant = "89ab"[index % 4] ?? "8";
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function dateTimeSpellings(iso: string): string[] {
  return [iso, iso.replace(".000Z", "Z"), iso.slice(0, 19), iso.slice(0, 16)];
}

function timeSpellings(time: string): string[] {
  return [time, time.slice(0, 5), `${time}.000`];
}
