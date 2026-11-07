/**
 * Stringify arbitrary data safely. Handles BigInt, circular references,
 * and Symbols which would otherwise throw or be silently dropped by
 * native JSON.stringify.
 */
export function safeStringify(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, replacer);
  } catch {
    return String(data);
  }
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return value.toString();
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return Array.from(value);
  return value;
}

/**
 * Byte length of a string in UTF-8 encoding (not char count), by the
 * `TextEncoder` every runtime Courier supports has. A page's code names no
 * global of Node: Parcel would bring in a polyfill for one.
 */
export function byteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

/**
 * Truncate a string preview at a UTF-8-safe byte boundary.
 * Avoids splitting multi-byte characters (e.g. emojis) which would
 * produce invalid UTF-8 sequences and break studio JSON parsing.
 */
export function truncatePreview(str: string, maxBytes: number): string {
  if (byteLength(str) <= maxBytes) return str;
  // Walk back from maxBytes until we find a valid char boundary
  let end = Math.min(str.length, maxBytes);
  while (end > 0 && byteLength(str.slice(0, end)) > maxBytes) {
    end--;
  }
  return `${str.slice(0, end)}…`;
}
