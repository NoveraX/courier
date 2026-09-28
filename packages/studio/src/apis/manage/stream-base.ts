import { firstFreeName } from "../../server/mocks-edit/plan/first-free-name";
import { insertion } from "../../server/mocks-edit/plan/insertion";
import type { ModuleBindings } from "../../server/mocks-edit/plan/module-bindings";
import type { ParsedSource } from "../../server/mocks-edit/plan/parse-source";
import type { TextEdit } from "../../server/mocks-edit/types";
import { courierPattern, fileBase } from "./file-base";

/** The name a file's streams are built from, and what declares it when the file does not. */
export interface StreamBase {
  base: string;
  /** Adds the builder to the `{ … }` the file destructures `courier()` into */
  edit: TextEdit | null;
  /** A declaration of its own, for a file that destructures no `courier()` */
  line: string | null;
}

/**
 * The name added streams of events are written under in a file that already
 * builds endpoints: the builder the file names, or `stream` added beside the
 * builders its `courier()` call is destructured into, or — when it
 * destructures none — a declaration of its own. A name the file binds for
 * something else is not taken.
 *
 * @param parsed - The file
 * @param bindings - The names it binds at its top level
 * @returns The base, and the edit or the line that declares it, if any
 * @example
 * ```ts
 * streamBase(parseSource("a.ts", "const { endpoint } = courier();"), bindings);
 * // → { base: "stream", edit: { start: 16, end: 16, text: ", stream" }, line: null }
 * ```
 */
export function streamBase(parsed: ParsedSource, bindings: ModuleBindings): StreamBase {
  const named = fileBase(parsed.program, "stream");
  if (named !== null) return { base: named, edit: null, line: null };
  const base = firstFreeName("stream", bindings);
  const property = base === "stream" ? "stream" : `stream: ${base}`;
  const pattern = courierPattern(parsed.program);
  const last = pattern?.properties.at(-1);
  if (pattern && last) return { base, edit: insertion(last.end, `, ${property}`), line: null };
  return { base, edit: null, line: `const { ${property} } = courier();` };
}
