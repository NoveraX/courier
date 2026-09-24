import type { Checked } from "./read-fields";
import { readFields } from "./read-fields";
import { readMockDeclaration } from "./read-mock-declaration";
import type { MockDeclaration } from "./types";

/** A request to declare mocks, read field by field and checked in shape. */
export interface DeclareBody {
  mocks: MockDeclaration[];
  /** sha256 of the file the previewed plan started from; always `null` for a preview. */
  baseHash: string | null;
  /** sha256 of the file the previewed plan would write; always `null` for a preview. */
  planDigest: string | null;
}

/** Whether the request only asks what the edit would be, or asks to make it. */
export type DeclareMode = "preview" | "apply";

const MAX_MOCKS = 20;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const PREVIEW_FIELDS = ["mocks"] as const;
const APPLY_FIELDS = ["mocks", "baseHash", "planDigest"] as const;

function readMocks(value: unknown): Checked<MockDeclaration[]> {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MOCKS) {
    return { ok: false, message: `mocks must be an array of 1 to ${MAX_MOCKS} mocks` };
  }
  const mocks: MockDeclaration[] = [];
  for (let index = 0; index < value.length; index++) {
    const mock = readMockDeclaration(value[index], index);
    if (!mock.ok) return mock;
    mocks.push(mock.value);
  }
  return { ok: true, value: mocks };
}

function readHashes(body: Readonly<Record<string, unknown>>): Checked<[string | null, string]> {
  const { baseHash, planDigest } = body;
  if (baseHash !== null && (typeof baseHash !== "string" || !SHA256_HEX.test(baseHash))) {
    return { ok: false, message: "baseHash must be null or 64 lowercase hex characters" };
  }
  if (typeof planDigest !== "string" || !SHA256_HEX.test(planDigest)) {
    return { ok: false, message: "planDigest must be 64 lowercase hex characters" };
  }
  return { ok: true, value: [baseHash, planDigest] };
}

/**
 * Reads the body of a request to preview or apply declaring mocks, checking
 * its shape: the fields it must have and nothing else, each of its JSON type,
 * and the hashes of an apply in their format.
 *
 * Every object in the result is built here field by field, so nothing the
 * sender attached to the body — extra fields, a prototype — travels further.
 * A failure is meant for an HTTP 400: its message names the field. Whether
 * the values can be declared is for {@link validateDeclarations}, which the
 * wizard can show next to each field.
 *
 * @param body - The parsed JSON body.
 * @param mode - `"preview"` takes only `mocks`; `"apply"` also takes the
 *   `baseHash` and `planDigest` the preview returned.
 * @returns The request, or a message naming the first field that is wrong.
 * @example
 * validateDeclareBody(
 *   { mocks: [{ key: "users", source: "users", port: "4000", seedCount: 20, autoStart: true }] },
 *   "preview",
 * );
 * // { ok: false, message: "mocks[0].port must be null or a number" }
 */
export function validateDeclareBody(body: unknown, mode: DeclareMode): Checked<DeclareBody> {
  const read = readFields(body, "", mode === "apply" ? APPLY_FIELDS : PREVIEW_FIELDS);
  if (!read.ok) return read;
  const mocks = readMocks(read.value.mocks);
  if (!mocks.ok) return mocks;
  if (mode === "preview") {
    return { ok: true, value: { mocks: mocks.value, baseHash: null, planDigest: null } };
  }
  const hashes = readHashes(read.value);
  if (!hashes.ok) return hashes;
  const [baseHash, planDigest] = hashes.value;
  return { ok: true, value: { mocks: mocks.value, baseHash, planDigest } };
}
