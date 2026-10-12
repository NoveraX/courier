/**
 * Parses existing (potentially user-modified) group files for smart merge.
 *
 * Extracts imports, group metadata, endpoints, and non-endpoint code — every
 * part found by the file's syntax, so a description the specification wrote
 * into a comment or a string is never read as code.
 */

import { fileBase } from "../manage/file-base";
import { type DeclarationLayout, readLayout } from "./declaration-layout";
import { importsOf, parseImports } from "./parse-imports";
import type { ExistingGroupInfo } from "./types";

/** Head a generated endpoint starts with. */
const DEFAULT_BASE = "endpoint";

/**
 * Read a group's file, or a flat API's, into the parts a merge combines.
 *
 * @param content - The file's text
 * @returns Its parts; a file with no layout to read has its imports alone
 * @example
 * ```ts
 * parseExistingGroup(groupFile).endpoints.map((entry) => entry.name); // ["listPets", "createPet"]
 * ```
 */
export function parseExistingGroup(content: string): ExistingGroupInfo {
  const layout = readLayout(content);
  if (layout !== null) return groupInfo(layout);
  return {
    groupName: "",
    prefix: "",
    header: [],
    footer: [],
    baseName: DEFAULT_BASE,
    streamBaseName: null,
    imports: parseImports(content.split("\n")),
    endpoints: [],
    head: [],
    preamble: [],
    trailingCode: [],
  };
}

/**
 * The parts of a file whose layout is read.
 *
 * The builders the endpoints start from are read from the statements above
 * the declaration only: one declared below it is not yet bound when the
 * declaration runs.
 *
 * @param layout - The file's layout
 * @returns Its parts
 * @example
 * ```ts
 * groupInfo(readLayout(text, "pets")).baseName; // "endpoint"
 * ```
 */
export function groupInfo(layout: DeclarationLayout): ExistingGroupInfo {
  const above = { ...layout.parsed.program, body: layout.above };
  return {
    groupName: layout.declaration.name ?? "",
    prefix: layout.declaration.prefix ?? "",
    header: layout.header,
    footer: layout.footer,
    baseName: fileBase(above) ?? DEFAULT_BASE,
    streamBaseName: fileBase(above, "stream"),
    imports: importsOf(layout.parsed.text, layout.imports),
    endpoints: layout.endpoints,
    head: layout.head,
    preamble: layout.preamble,
    trailingCode: layout.trailing,
  };
}
