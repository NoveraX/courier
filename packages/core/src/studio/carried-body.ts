/** The most of a body, as JSON, that one of Studio's events carries. */
export const CARRIED_BODY_BYTES: number = 16 * 1024;

/* A part smaller than this is left out rather than cut to a stub. */
const MIN_ROOM = 64;

/** A body as Studio's events carry it: whole while it is small, a part of it once it is not. */
export interface CarriedBody {
  /**
   * The body, or as much of it as fits: the first items of a list, the
   * small fields of an object and a part of each large one, the start of a
   * string — each part left out named where it was, as `"… 45,800 more items"`.
   */
  value: unknown;
  /** The whole body as JSON, and its size in bytes, when `value` is a part of it. */
  whole?: { text: string; bytes: number } | undefined;
}

const plural = (count: number, noun: string): string =>
  `… ${count.toLocaleString("en-US")} more ${noun}${count === 1 ? "" : "s"}`;

function sizeOf(value: unknown): number {
  return JSON.stringify(value)?.length ?? 0;
}

function isFields(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cutText(text: string, room: number): string {
  const kept = Math.max(0, room - 32);
  return `${text.slice(0, kept)}${plural(text.length - kept, "character")}`;
}

/* The first items that fit; a first item too large for the room is cut to fit it. */
function cutList(list: readonly unknown[], room: number): unknown[] {
  const kept: unknown[] = [];
  let left = room;
  for (const item of list) {
    const size = sizeOf(item) + 1;
    if (size > left) {
      if (kept.length === 0 && left >= MIN_ROOM) kept.push(cut(item, left));
      break;
    }
    kept.push(item);
    left -= size;
  }
  if (kept.length < list.length) kept.push(plural(list.length - kept.length, "item"));
  return kept;
}

/* The small fields whole, in half the room at most; the large ones share the
   rest, each cut to its share, in their order. */
function cutFields(fields: Record<string, unknown>, room: number): Record<string, unknown> {
  const entries = Object.entries(fields);
  const sizes = entries.map(([key, value]) => key.length + 4 + sizeOf(value));
  const small = new Set<number>();
  let used = 0;
  sizes.forEach((size, index) => {
    if (size <= room / 8 && used + size <= room / 2) {
      small.add(index);
      used += size;
    }
  });
  const share = (room - used) / Math.max(1, entries.length - small.size);
  const kept: Record<string, unknown> = {};
  let dropped = 0;
  entries.forEach(([key, value], index) => {
    const size = sizes[index] ?? 0;
    if (small.has(index) || size <= share) kept[key] = value;
    else if (share >= MIN_ROOM) kept[key] = cut(value, share - key.length - 4);
    else dropped += 1;
  });
  if (dropped > 0) kept["…"] = plural(dropped, "field");
  return kept;
}

function cut(value: unknown, room: number): unknown {
  if (typeof value === "string") return cutText(value, room);
  if (Array.isArray(value)) return cutList(value, room);
  if (isFields(value)) return cutFields(value, room);
  return value;
}

/* Its size in UTF-8, without encoding it: a pair of surrogates is four bytes. */
function bytesOf(text: string): number {
  let bytes = text.length;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdfff) bytes += 1;
    else if (code > 0x7ff) bytes += 2;
    else if (code > 0x7f) bytes += 1;
  }
  return bytes;
}

/**
 * A body as Studio's events carry it: the body itself while its JSON fits
 * `limit`, and once it does not, a part of it that does, with the whole as
 * JSON for whoever keeps it. A list of tens of thousands of records is sent
 * as its first records and a count of the rest, so no request event grows
 * with what an API answers. A body with no JSON is carried as a note why.
 *
 * @param value - The body
 * @param limit - The most of it, as JSON, to carry
 * @returns The body to carry, and the whole when that is a part of it
 * @example
 * ```ts
 * const { value, whole } = carriedBody(await response.json());
 * emit({ type: "request:end", data: value, ...(whole && { dataCutFrom: whole.bytes }) });
 * ```
 */
export function carriedBody(value: unknown, limit: number = CARRIED_BODY_BYTES): CarriedBody {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch (error) {
    /* A body with a cycle or a bigint has no JSON, and no event could carry
       it: the event says so in its place. */
    return {
      value: `[a body with no JSON: ${error instanceof Error ? error.message : String(error)}]`,
    };
  }
  if (text === undefined || text.length <= limit) return { value };
  return { value: cut(value, limit), whole: { text, bytes: bytesOf(text) } };
}
