import { aboveStatement } from "../manage/above-statement";
import { courierPattern } from "../manage/file-base";
import type { DeclarationLayout } from "./declaration-layout";

/**
 * A file's text made to name the stream builder, for a merge that brings
 * the file its first stream of events: `stream` added to the builders its
 * `courier()` call is destructured into, or a declaration of its own above
 * the declaration and its comments when it destructures none. The call is
 * found by the file's syntax, never by a line that only reads like it.
 *
 * @param layout - The file, laid out
 * @returns The file's text, naming `stream`
 * @example
 * ```ts
 * withStreamBuilder(readLayout(onDisk)); // 'const { endpoint, stream } = courier();\n…'
 * ```
 */
export function withStreamBuilder(layout: DeclarationLayout): string {
  const { text } = layout.parsed;
  const above = { ...layout.parsed.program, body: layout.above };
  const last = courierPattern(above)?.properties.at(-1);
  if (last?.type === "RestElement") {
    return `${text.slice(0, last.start)}stream, ${text.slice(last.start)}`;
  }
  if (last !== undefined) return `${text.slice(0, last.end)}, stream${text.slice(last.end)}`;
  const at = aboveStatement(layout.parsed, layout.declaration.statement.start);
  return `${text.slice(0, at)}const { stream } = courier();\n\n${text.slice(at)}`;
}
