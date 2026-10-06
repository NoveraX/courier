import type { ObjectExpression, Program, Statement, VariableDeclaration } from "oxc-parser";
import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import { lineStart } from "../../server/mocks-edit/plan/line-start";
import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import { propertyKeyName } from "../../server/mocks-edit/plan/property-key-name";
import { unwrapExpression } from "../../server/mocks-edit/plan/unwrap-expression";
import { codeMentions } from "./code-mentions";
import { dropUnusedImports } from "./drop-unused-imports";
import { findApiConfig } from "./endpoints-object";
import { planEntryRemoval } from "./entry-removal";

/* The object a config property holds, when it is an object literal. */
function objectAt(
  config: ObjectExpression,
  key: string,
): { at: number; value: ObjectExpression } | null {
  const at = config.properties.findIndex(
    (p) => p.type === "Property" && !p.computed && propertyKeyName(p.key) === key,
  );
  const property = config.properties[at];
  if (property?.type !== "Property") return null;
  const value = unwrapExpression(property.value);
  return value.type === "ObjectExpression" ? { at, value } : null;
}

/* The top-level statements taking builders out of a `courier()` call. */
function builderStatements(program: Program): VariableDeclaration[] {
  return program.body.filter((statement): statement is VariableDeclaration => {
    if (statement.type !== "VariableDeclaration") return false;
    return statement.declarations.every(({ id, init }) => {
      const call = init === null ? null : unwrapExpression(init);
      return (
        id.type === "ObjectPattern" &&
        call?.type === "CallExpression" &&
        call.callee.type === "Identifier" &&
        call.callee.name === "courier"
      );
    });
  });
}

/* The plain names a `{ … }` pattern binds: `endpoint`, or `base` for `endpoint: base`. */
function boundNames(id: VariableDeclaration["declarations"][number]["id"]): string[] {
  if (id.type !== "ObjectPattern") return [];
  return id.properties.flatMap((p) =>
    p.type === "Property" && p.value.type === "Identifier" ? [p.value.name] : [],
  );
}

/* The text without a statement's lines, and the blank line after them. */
function withoutLines(text: string, statement: Statement): string {
  const start = lineStart(text, statement.start);
  const eol = text.indexOf("\n", statement.end);
  let end = eol === -1 ? text.length : eol + 1;
  const blank = /^[ \t]*\r?\n/.exec(text.slice(end));
  if (blank !== null) end += blank[0].length;
  return text.slice(0, start) + text.slice(end);
}

/**
 * An import's source once the last of the API's own endpoints is gone,
 * as the generator writes a source that lists only groups: no `endpoints`
 * object, no builders taken from `courier()` that nothing uses, and no
 * import left unused by them. A source without groups keeps its empty
 * `endpoints`, as `defineApi` takes one or the other; one that still holds
 * endpoints, or does not parse, stays as it is.
 *
 * @param path - The source file, project-relative
 * @param content - The file as the removal leaves it
 * @returns The file without what the API's own endpoints needed
 * @example
 * ```ts
 * withoutEmptyEndpoints("src/api/pets/source.ts", text); // no `endpoints: {}` left beside `groups`
 * ```
 */
export function withoutEmptyEndpoints(path: string, content: string): string {
  const parsed = parseSource(path, content);
  const config = parsed.problem === null ? findApiConfig(parsed.program) : null;
  if (config === null) return content;
  const endpoints = objectAt(config, "endpoints");
  const groups = objectAt(config, "groups");
  if (endpoints === null || endpoints.value.properties.length > 0) return content;
  if (groups === null || groups.value.properties.length === 0) return content;
  let text = applyEdits(
    content,
    planEntryRemoval(parsed, config.properties, config.start, new Set([endpoints.at])),
  );
  for (const statement of builderStatements(parseSource(path, text).program).reverse()) {
    const without = withoutLines(text, statement);
    const reparsed = parseSource(path, without);
    if (reparsed.problem !== null) continue;
    const mentions = codeMentions(reparsed);
    const names = statement.declarations.flatMap(({ id }) => boundNames(id));
    if (!names.some(mentions)) text = without;
  }
  return dropUnusedImports(path, text, new Set(["courier"]));
}
