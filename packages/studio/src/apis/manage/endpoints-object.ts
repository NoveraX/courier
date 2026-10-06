import type { ObjectExpression, Program } from "oxc-parser";
import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import { detectStyle } from "../../server/mocks-edit/plan/detect-style";
import { insertion } from "../../server/mocks-edit/plan/insertion";
import { lineStart } from "../../server/mocks-edit/plan/line-start";
import { planListInsertion } from "../../server/mocks-edit/plan/list-insertion";
import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import { propertyKeyName } from "../../server/mocks-edit/plan/property-key-name";
import { unwrapExpression } from "../../server/mocks-edit/plan/unwrap-expression";
import { docCommentBefore } from "./doc-comment-before";
import { UnrecognizedFileError } from "./unrecognized-file-error";

/**
 * The object literal the first top-level `defineApi(…)` declaration is
 * called with: an import's source.
 *
 * @param program - The parsed source file
 * @returns The object, or `null` when the file declares no API from one
 * @example
 * ```ts
 * findApiConfig(parseSource("source.ts", text).program)?.properties.length;
 * ```
 */
export function findApiConfig(program: Program): ObjectExpression | null {
  for (const statement of program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const { init } of declaration.declarations) {
      const call = init === null ? null : unwrapExpression(init);
      if (call?.type !== "CallExpression" || call.callee.type !== "Identifier") continue;
      if (call.callee.name !== "defineApi") continue;
      const [config] = call.arguments;
      const object =
        config === undefined || config.type === "SpreadElement" ? null : unwrapExpression(config);
      if (object?.type === "ObjectExpression") return object;
    }
  }
  return null;
}

/**
 * An import's source with an empty `endpoints` object for the API's own
 * endpoints, which a source listing only groups does not have: it goes
 * right before `groups`, on a line of its own when `groups` has one, as the
 * generator writes it. A source that has one stays as it is.
 *
 * @param path - The source file, project-relative, to name in a refusal
 * @param content - The file as it is
 * @returns The file with the object
 * @throws {UnrecognizedFileError} When the file does not parse, or declares no API
 * @example
 * ```ts
 * withEndpointsObject("src/api/pets/source.ts", text); // "…  endpoints: {},\n  groups: {…"
 * ```
 */
export function withEndpointsObject(path: string, content: string): string {
  const parsed = parseSource(path, content);
  const config = parsed.problem === null ? findApiConfig(parsed.program) : null;
  if (config === null) throw new UnrecognizedFileError(path);
  const named = (key: string) =>
    config.properties.find(
      (p) => p.type === "Property" && !p.computed && propertyKeyName(p.key) === key,
    );
  if (named("endpoints") !== undefined) return content;
  const style = detectStyle(parsed, config);
  const groups = named("groups");
  if (groups !== undefined) {
    /* Above the comment that documents `groups`, which stays with it. */
    const anchor = docCommentBefore(content, parsed.comments, groups.start)?.start ?? groups.start;
    const start = lineStart(content, anchor);
    const indent = content.slice(start, anchor);
    const edit = /^[ \t]*$/.test(indent)
      ? insertion(start, `${indent}endpoints: {},${style.eol}`)
      : insertion(anchor, "endpoints: {}, ");
    return applyEdits(content, [edit]);
  }
  const site = {
    text: content,
    comments: parsed.comments,
    commentEnds: parsed.commentEnds,
    style,
    singleLineFile: false,
  };
  const list = { open: config.start, close: config.end - 1, items: config.properties };
  return applyEdits(
    content,
    planListInsertion(list, site, () => ["endpoints: {}"]),
  );
}
