import { parseSpec } from "../../apis/parser/parse-spec";
import { computeSpecHash } from "../../apis/registry/spec-hash";
import { resolveBaseURL } from "../../apis/resolve-base-url";
import type { ReplyTo, SpecReadJob } from "./spec-thread-protocol";

/**
 * Read a specification as the parse route answers it: parsed, its server
 * address made absolute against the URL it came from, and as JSON — which
 * the page sends back to have its code generated, so one larger than its
 * caller may send is answered with its size instead. Asked for its hash,
 * the reply carries the hash an update check compares, of the specification
 * as the JSON holds it, whatever its size: a check of one that did not
 * change needs none of it sent.
 *
 * @param job - The text, the URL it was fetched from, the most its JSON may be, and whether to hash it
 * @returns The specification as JSON, or its size when that is too large; with its hash when asked
 * @throws What parsing the text throws: the text is no specification Studio reads
 * @example
 * ```ts
 * readSpecJob({ kind: "spec:read", text: "openapi: 3.1.0\n…", maxBytes: 16 * 1024 * 1024 });
 * // → { kind: "spec:read", json: "{…}" }
 * ```
 */
export function readSpecJob({ text, url, maxBytes, hash }: SpecReadJob): ReplyTo<"spec:read"> {
  const parsed = parseSpec(text);
  const spec = url === undefined ? parsed : resolveBaseURL(parsed, url);
  const json = JSON.stringify(spec);
  const bytes = Buffer.byteLength(json);
  const hashed = hash === true ? { hash: computeSpecHash(spec) } : {};
  if (bytes > maxBytes) return { kind: "spec:read", tooLarge: bytes, ...hashed };
  return { kind: "spec:read", json, ...hashed };
}
