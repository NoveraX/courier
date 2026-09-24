import { createHash } from "node:crypto";
import { TRANSFORM_ENTRY_FORMAT } from "./transform-entry-format";

/**
 * What an entry holds for the input a reader asks about.
 *
 * - `hit`: the code transformed from exactly that input.
 * - `stale`: another input's transform, or a format this version does not
 *   write; the next write replaces it.
 * - `damaged`: the header names that input but the body is not the one it
 *   describes, as after a crash that kept the header of a half-written file.
 */
export type TransformEntryState =
  | { state: "hit"; code: string }
  | { state: "stale" }
  | { state: "damaged" };

/* The prefix holds no character a pattern treats specially. */
const HEADER = new RegExp(
  `^${TRANSFORM_ENTRY_FORMAT.prefix}${TRANSFORM_ENTRY_FORMAT.version} ([0-9a-f]{64}) (\\d{1,15}) ([0-9a-f]{64})$`,
);
const NEWLINE = 0x0a;
/* Longer than any header this format writes, so a file with no line break
   near its start is rejected without scanning the whole of it. */
const MAX_HEADER_BYTES = 256;

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Read an entry as the answer for the input whose digest is `digest`.
 *
 * @param bytes - The whole entry, as read from disk
 * @param digest - The digest of the input being transformed
 * @returns Its code when the header names that input and the body matches
 *   the header's length and sha256; otherwise why it is not a hit
 * @example
 * ```ts
 * const entry = decodeTransformEntry(readFileSync(path), digest);
 * if (entry.state === "hit") return entry.code;
 * ```
 */
export function decodeTransformEntry(bytes: Buffer, digest: string): TransformEntryState {
  const end = bytes.subarray(0, MAX_HEADER_BYTES).indexOf(NEWLINE);
  if (end === -1) return { state: "stale" };
  const header = HEADER.exec(bytes.toString("latin1", 0, end));
  if (header === null || header[1] !== digest) return { state: "stale" };
  const body = bytes.subarray(end + 1);
  if (body.length !== Number(header[2]) || sha256Hex(body) !== header[3])
    return { state: "damaged" };
  return { state: "hit", code: body.toString("utf8") };
}
