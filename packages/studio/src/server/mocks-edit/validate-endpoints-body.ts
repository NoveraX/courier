import type { Checked } from "./read-fields";
import { readFields } from "./read-fields";
import type { DeclareMode } from "./validate-declare-body";
import { readHashes } from "./validate-declare-body";
import { endpointsProblem, keyProblem } from "./value-problem";

/** A request to add endpoints to the list a mock answers, read field by field and checked in shape. */
export interface EndpointsBody {
  /** The mock's key in `courier.mocks.ts`. */
  key: string;
  /** The endpoints to add, as `group.method`. */
  endpoints: string[];
  /** sha256 of the file the previewed plan started from; always `null` for a preview. */
  baseHash: string | null;
  /** sha256 of the file the previewed plan would write; always `null` for a preview. */
  planDigest: string | null;
}

/** The most endpoints a mock lists, and so the most one request adds. */
export const MAX_MOCK_ENDPOINTS = 500;

const PREVIEW_FIELDS = ["key", "endpoints"] as const;
const APPLY_FIELDS = ["key", "endpoints", "baseHash", "planDigest"] as const;

function readEndpoints(value: unknown): Checked<string[]> {
  const names =
    Array.isArray(value) &&
    value.length <= MAX_MOCK_ENDPOINTS &&
    value.every((name): name is string => typeof name === "string")
      ? value
      : null;
  if (names === null) {
    return {
      ok: false,
      message: `endpoints must be an array of up to ${MAX_MOCK_ENDPOINTS} names`,
    };
  }
  const problem = endpointsProblem(names);
  return problem === null ? { ok: true, value: names } : { ok: false, message: problem };
}

/**
 * Read a request to add endpoints to a mock: its key, as it is written in
 * the mocks file, and the endpoints by name — both checked by the rules a
 * declaration's are, since a snippet built from them carries them as code —
 * and, to make the edit, the hashes of the preview it confirms.
 *
 * @param body - The parsed JSON body
 * @param mode - Whether the request previews the edit or makes it
 * @returns The request, or a message naming the first field that is wrong
 * @example
 * ```ts
 * validateEndpointsBody({ key: "shop", endpoints: ["orders.refund"] }, "preview");
 * // { ok: true, value: { key: "shop", endpoints: ["orders.refund"], baseHash: null, planDigest: null } }
 * ```
 */
export function validateEndpointsBody(body: unknown, mode: DeclareMode): Checked<EndpointsBody> {
  const read = readFields(body, "", mode === "apply" ? APPLY_FIELDS : PREVIEW_FIELDS);
  if (!read.ok) return read;
  const { key } = read.value;
  if (typeof key !== "string") return { ok: false, message: "key must be a string" };
  const keyIssue = keyProblem(key);
  if (keyIssue !== null) return { ok: false, message: keyIssue };
  const endpoints = readEndpoints(read.value.endpoints);
  if (!endpoints.ok) return endpoints;
  if (mode === "preview") {
    return {
      ok: true,
      value: { key, endpoints: endpoints.value, baseHash: null, planDigest: null },
    };
  }
  const hashes = readHashes(read.value);
  if (!hashes.ok) return hashes;
  const [baseHash, planDigest] = hashes.value;
  return { ok: true, value: { key, endpoints: endpoints.value, baseHash, planDigest } };
}
