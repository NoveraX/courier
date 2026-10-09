import { readGenerateOptions } from "./generate-options-guard";
import { isRecord } from "./mocks-edit/is-record";
import { isParsedSpec } from "./parsed-spec-guard";
import type { WriteBody } from "./write-types";

const IMPORT_TYPES = ["url", "file", "raw"] as const;

/**
 * Read a request to write an import's files: its name, the spec and options
 * to generate from, where the spec came from, and the plan the user was
 * shown with the steps the user allowed. Anything else is ignored.
 *
 * @param value - The request body
 * @returns The request, or `null` when it lacks a field or holds one of the wrong kind
 * @example
 * ```ts
 * const body = readWriteBody(req.body);
 * if (body === null) return res.status(400).json({ error: "…" });
 * ```
 */
export function readWriteBody(value: unknown): WriteBody | null {
  if (!isRecord(value) || typeof value.sourceName !== "string" || !isParsedSpec(value.spec))
    return null;
  const options = readGenerateOptions(value.options);
  if (options === null) return null;
  const importType = IMPORT_TYPES.find((type) => type === value.importType);
  if (value.importType !== undefined && importType === undefined) return null;
  if (value.specUrl !== undefined && typeof value.specUrl !== "string") return null;
  /* Read from traffic, a specification reaches the wizard as pasted text. */
  if (value.origin !== undefined && (value.origin !== "traffic" || importType !== "raw"))
    return null;
  if (value.planDigest !== undefined && typeof value.planDigest !== "string") return null;
  const confirm = value.confirm;
  if (
    confirm !== undefined &&
    !(Array.isArray(confirm) && confirm.every((path) => typeof path === "string"))
  ) {
    return null;
  }
  return {
    sourceName: value.sourceName,
    spec: value.spec,
    options,
    ...(importType !== undefined && { importType }),
    ...(value.origin === "traffic" && { origin: "traffic" as const }),
    ...(typeof value.specUrl === "string" && { specUrl: value.specUrl }),
    ...(typeof value.planDigest === "string" && { planDigest: value.planDigest }),
    ...(confirm !== undefined && { confirm }),
  };
}
