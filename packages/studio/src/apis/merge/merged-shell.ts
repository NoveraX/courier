import type { ObjectExpression } from "oxc-parser";

import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import { propertyKeyName } from "../../server/mocks-edit/plan/property-key-name";
import { findGroupDeclaration } from "../manage/group-declaration";
import { findEndpointsBlock } from "./endpoints-block";

/** A declaration's lines around its endpoints, and the options the user added to it. */
export interface MergedShell {
  /** From the declaration to the line opening `endpoints`. */
  header: string[];
  /** From the line closing `endpoints` to the declaration's end. */
  footer: string[];
  /** The options the file has and a generated one does not: the user's own. */
  kept: string[];
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

/**
 * The declaration a merge writes around the endpoints: the file's own, each
 * option the generator writes — a `baseURL`, a `prefix` — taken from the
 * new file, and every option the user added kept. Taken whole from the new
 * file, the declaration dropped what the user had added, such as a group's
 * `headers` or a source's `proxyPath`.
 *
 * @param existing - The file on disk
 * @param generated - The file the import generated
 * @returns The merged lines, or `null` when either file has no declaration to read
 * @example
 * ```ts
 * mergedShell(onDisk, fresh)?.kept; // ["proxyPath"]
 * ```
 */
export function mergedShell(existing: string, generated: string): MergedShell | null {
  const own = findGroupDeclaration(parseSource("existing.ts", existing).program);
  const fresh = findGroupDeclaration(parseSource("generated.ts", generated).program);
  if (own === null || fresh === null) return null;
  const freshOptions = options(fresh.config, generated);
  const ownOptions = options(own.config, existing);
  const endpoints = own.config.properties.find(
    (property) => property.type === "Property" && propertyKeyName(property.key) === "endpoints",
  );
  if (endpoints === undefined) return null;
  const edits: Edit[] = [];
  const lineStart = existing.lastIndexOf("\n", endpoints.start - 1) + 1;
  const indent = existing.slice(lineStart, endpoints.start);
  for (const [name, text] of freshOptions) {
    const at = ownOptions.get(name);
    if (at === undefined) {
      edits.push({ start: lineStart, end: lineStart, text: `${indent}${text.text},\n` });
    } else if (at.text !== text.text) {
      edits.push({ start: at.start, end: at.end, text: text.text });
    }
  }
  const lines = applied(existing, edits).split("\n");
  const block = findEndpointsBlock(lines);
  if (block === null) return null;
  return {
    header: lines.slice(block.declaration, block.open + 1),
    footer: lines.slice(block.close, block.end + 1),
    kept: [...ownOptions.keys()].filter((name) => !freshOptions.has(name)),
  };
}

/* Each option a declaration's object names, but its endpoints, as its text and where it is. */
function options(config: ObjectExpression, content: string): Map<string, Edit> {
  const found = new Map<string, Edit>();
  for (const property of config.properties) {
    if (property.type !== "Property" || property.computed) continue;
    const name = propertyKeyName(property.key);
    if (name === null || name === "endpoints") continue;
    found.set(name, {
      start: property.start,
      end: property.end,
      text: content.slice(property.start, property.end),
    });
  }
  return found;
}

/* The text with each edit made, the last first, so the earlier offsets hold;
   of two made at one place, the later is made first, so they read in order. */
function applied(content: string, edits: readonly Edit[]): string {
  const order = edits.map((edit, index) => ({ edit, index }));
  order.sort((a, b) => b.edit.start - a.edit.start || b.index - a.index);
  let text = content;
  for (const { edit } of order) {
    text = `${text.slice(0, edit.start)}${edit.text}${text.slice(edit.end)}`;
  }
  return text;
}
