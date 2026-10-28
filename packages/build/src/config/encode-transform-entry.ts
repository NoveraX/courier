import { createHash } from "node:crypto";
import { TRANSFORM_ENTRY_FORMAT } from "./transform-entry-format";

/**
 * The bytes of an entry holding `code`, the transform of the input whose
 * digest is `digest`.
 *
 * The first line names the format's version, the input digest, and the byte
 * length and sha256 of the UTF-8 body that follows it, so a reader can tell
 * a complete entry from a truncated or altered one.
 *
 * @param digest - The input digest, as `transformDigest` computes it
 * @param code - The transformed code; well-formed UTF-16, so UTF-8 keeps it exactly
 * @returns The entry's bytes
 * @example
 * ```ts
 * writeFileSync(path, encodeTransformEntry(digest, result.code));
 * ```
 */
export function encodeTransformEntry(digest: string, code: string): Buffer {
  const { prefix, version } = TRANSFORM_ENTRY_FORMAT;
  const body = Buffer.from(code, "utf8");
  const bodySha256 = createHash("sha256").update(body).digest("hex");
  const header = `${prefix}${version} ${digest} ${body.length} ${bodySha256}\n`;
  return Buffer.concat([Buffer.from(header, "latin1"), body]);
}
