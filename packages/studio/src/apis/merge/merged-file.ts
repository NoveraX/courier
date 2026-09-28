import type { parseExistingGroup } from "./parse-existing";
import type { MergeChange, MergeStatus } from "./types";

/**
 * The merged group file: the merged imports, the preamble the user kept, the
 * generated declaration with the merged endpoints inside, and the code the
 * user kept after it.
 *
 * @param importLines - The merged import statements
 * @param preamble - What sat between the imports and the declaration
 * @param generated - The freshly generated file, whose declaration is used
 * @param endpointLines - The merged endpoints
 * @param trailingCode - What sat after the declaration
 * @returns The file's text
 * @example
 * ```ts
 * const content = buildFile(imports, preamble, parseExistingGroup(generated), endpoints, trailing);
 * ```
 */
export function buildFile(
  importLines: string[],
  preamble: string[],
  generated: ReturnType<typeof parseExistingGroup>,
  endpointLines: string[],
  trailingCode: string[],
): string {
  /* The declaration is taken from the freshly generated file — that is where a
     changed baseURL or prefix arrives — and only the endpoints between are
     merged. A group and a flat source differ only in what that shell says. */
  const header =
    generated.header.length > 0
      ? generated.header
      : [
          `export const ${generated.groupName} = defineGroup({`,
          `  prefix: "${generated.prefix}",`,
          "  endpoints: {",
        ];
  const footer = generated.footer.length > 0 ? generated.footer : ["  },", "});"];

  const lines = [
    ...importLines,
    "",
    ...(preamble.length > 0 ? [...preamble, ""] : []),
    ...header,
    ...endpointLines,
    ...footer,
    "",
  ];

  if (trailingCode.length > 0) {
    lines.push(...trailingCode, "");
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
