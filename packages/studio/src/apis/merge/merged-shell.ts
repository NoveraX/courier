import type { ObjectExpression } from "oxc-parser";

import { propertyKeyName } from "../../server/mocks-edit/plan/property-key-name";
import { type DeclarationLayout, readLayout } from "./declaration-layout";

/** A declaration's lines around its endpoints, and the options the user added to it. */
export interface MergedShell {
  /** From the declaration to the `{` opening `endpoints`. */
  header: string[];
  /** From the `}` closing `endpoints` to the declaration's end. */
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
 * @param own - The file on disk, laid out
 * @param fresh - The file the import generated, laid out
 * @param prefix - The prefix the merged group declares where the generated one declares one
 * @returns The merged lines, or `null` when the file with the options written cannot be laid out
 * @example
 * ```ts
 * mergedShell(readLayout(onDisk), readLayout(fresh), "/users")?.kept; // ["proxyPath"]
 * ```
 */
export function mergedShell(
  own: DeclarationLayout,
  fresh: DeclarationLayout,
  prefix: string,
): MergedShell | null {
  const freshOptions = options(fresh.declaration.config, fresh.parsed.text);
  const ownOptions = options(own.declaration.config, own.parsed.text);
  const generatedPrefix = freshOptions.get("prefix");
  if (generatedPrefix !== undefined && prefix !== fresh.declaration.prefix) {
    freshOptions.set("prefix", { ...generatedPrefix, text: `prefix: ${JSON.stringify(prefix)}` });
  }
  const edits = optionEdits(own, ownOptions, freshOptions);
  const layout = edits && readLayout(applied(own.parsed.text, edits), own.declaration.name);
  if (!layout) return null;
  return {
    header: layout.header,
    footer: layout.footer,
    kept: [...ownOptions.keys()].filter((name) => !freshOptions.has(name)),
  };
}

/* The edits writing each generated option into the file's declaration;
   `null` when it has no `endpoints` to write them before. */
function optionEdits(
  own: DeclarationLayout,
  ownOptions: ReadonlyMap<string, Edit>,
  freshOptions: ReadonlyMap<string, Edit>,
): Edit[] | null {
  const existing = own.parsed.text;
  const endpoints = own.declaration.config.properties.find(
    (property) =>
      property.type === "Property" &&
      !property.computed &&
      propertyKeyName(property.key) === "endpoints",
  );
  if (endpoints === undefined) return null;
  const lineStart = existing.lastIndexOf("\n", endpoints.start - 1) + 1;
  const indent = existing.slice(lineStart, endpoints.start);
  /* An option the file lacks goes on a line of its own above `endpoints`, or
     just before it when `endpoints` shares its line with something else. */
  const added = (text: string): Edit =>
    indent.trim() === ""
      ? { start: lineStart, end: lineStart, text: `${indent}${text},\n` }
      : { start: endpoints.start, end: endpoints.start, text: `${text}, ` };
  const edits: Edit[] = [];
  for (const [name, option] of freshOptions) {
    const at = ownOptions.get(name);
    if (at === undefined) edits.push(added(option.text));
    else if (at.text !== option.text) edits.push({ ...at, text: option.text });
  }
  return edits;
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
