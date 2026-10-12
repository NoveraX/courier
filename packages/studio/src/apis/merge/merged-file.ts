import type { MergeChange, MergeStatus } from "./types";

/** The parts of a merged group file, each as lines. */
export interface MergedParts {
  /** What sat above the file's imports. */
  head: readonly string[];
  /** The merged import statements. */
  imports: readonly string[];
  /** What sat between the imports and the declaration. */
  preamble: readonly string[];
  /** The declaration down to the `{` opening its endpoints. */
  header: readonly string[];
  /** The merged endpoints, each after its doc comment. */
  endpoints: readonly string[];
  /** From the `}` closing the endpoints to the declaration's end. */
  footer: readonly string[];
  /** What sat after the declaration, and the helpers the spec brought. */
  trailing: readonly string[];
}

/**
 * The merged group file: what sat above the imports, the merged imports, the
 * preamble the user kept, the declaration with the merged endpoints inside,
 * and the code the user kept after it.
 *
 * @param parts - The file's parts
 * @returns The file's text
 * @example
 * ```ts
 * const content = buildFile({ head, imports, preamble, header, endpoints, footer, trailing });
 * ```
 */
export function buildFile(parts: MergedParts): string {
  const { head, imports, preamble, header, endpoints, footer, trailing } = parts;
  const lines = [
    ...head,
    ...imports,
    "",
    ...(preamble.length > 0 ? [...preamble, ""] : []),
    ...header,
    ...endpoints,
    ...footer,
    "",
  ];

  if (trailing.length > 0) {
    lines.push(...trailing, "");
  }

  return lines.join("\n");
}

/**
 * How a merge went: `"merged"` when it kept code the user wrote, `"safe"`
 * when the file is the generated one with nothing of the user's to keep.
 *
 * @param changes - The merge's changes
 * @returns The merge's status
 * @example
 * ```ts
 * resolveStatus([{ type: "preserved", target: "endpoint:search", detail: "custom endpoint kept" }]); // → "merged"
 * ```
 */
export function resolveStatus(changes: MergeChange[]): MergeStatus {
  return changes.some((c) => c.type === "preserved") ? "merged" : "safe";
}
