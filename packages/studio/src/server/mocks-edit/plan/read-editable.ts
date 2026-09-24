import { MocksEditRefusal } from "../mocks-edit-refusal";
import { findCommonJsExport } from "./commonjs-export";
import { lineNumberAt } from "./line-number-at";
import type { LocatedMocks } from "./locate-mocks-object";
import { locateMocksObject } from "./locate-mocks-object";
import type { MockImports } from "./mock-imports";
import { readMockImports } from "./mock-imports";
import type { ParsedSource } from "./parse-source";
import { describeProblem, parseSource } from "./parse-source";

/** A mocks file Studio can edit, as read for the edit. */
export interface EditableFile {
  parsed: ParsedSource;
  /** What it imports from the mock package. */
  imports: MockImports;
  /** Its mocks object, or `absent` when it has no default export. */
  located: LocatedMocks;
  /** The keys the mocks object declares, in order; empty when there is none. */
  literalKeys: string[];
}

/**
 * Read a mocks file for an edit, refusing one Studio cannot edit safely: one
 * that does not parse, one that exports the CommonJS way — an edit of its
 * `export default` would sit beside exports it does not see — and one whose
 * default export is not an object literal Studio can see every key of.
 *
 * @param name - The file's name, which picks the parser's language
 * @param text - Its text; "" for a file Studio creates
 * @returns The parsed file, its mock-package imports and its mocks object
 * @throws {MocksEditRefusal} `PARSE_ERROR` with oxc's first message and its
 *   line; `MOCKS_COMMONJS` naming the form and its line; or what
 *   locating the mocks object refuses with
 *
 * @example
 * ```ts
 * readEditable("courier.mocks.ts", "export default {\n  users: 1,\n};\n").literalKeys; // → ["users"]
 * ```
 */
export function readEditable(name: string, text: string): EditableFile {
  const parsed = parseSource(name, text);
  if (parsed.problem !== null) {
    throw new MocksEditRefusal(
      "PARSE_ERROR",
      `${name} does not parse: ${describeProblem(parsed, parsed.problem)}`,
    );
  }
  refuseCommonJs(parsed);
  const imports = readMockImports(parsed.program);
  const located = locateMocksObject(parsed, imports);
  return { parsed, imports, located, literalKeys: located.kind === "object" ? located.keys : [] };
}

function refuseCommonJs(parsed: ParsedSource): void {
  const found = findCommonJsExport(parsed.program);
  if (found === null) return;
  const line = lineNumberAt(parsed.text, found.start);
  throw new MocksEditRefusal(
    "MOCKS_COMMONJS",
    `${parsed.fileName} exports with ${found.form} (line ${line}); Studio edits only a mocks file that is an ES module.`,
  );
}
