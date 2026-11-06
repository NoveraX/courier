import type { TextEdit } from "../migration";
import { isNode, walk } from "./ast";
import type { ParsedFile } from "./codemod-types";
import { sourceOf } from "./imports";
import { moveImports } from "./move-imports";

/** A module a release replaced: every name it exported comes from another now, but a few, which have modules of their own. */
export interface MovedModule {
  readonly from: string;
  readonly to: string;
  /** The names that went to other modules, by name: their new module. */
  readonly elsewhere: Readonly<Record<string, string>>;
}

/* A string literal naming the module: an import's, an export's, `import()`'s or `require()`'s. */
function moduleLiterals(
  file: ParsedFile,
  module: string,
): Array<{ start: number; end: number; quote: string; parent: string }> {
  const found: Array<{ start: number; end: number; quote: string; parent: string }> = [];
  walk(file.program, ({ node, ancestors, key }) => {
    const parent = ancestors.at(-1);
    if (node.type !== "Literal" || node.value !== module || parent === undefined) return;
    const required =
      parent.type === "CallExpression" && isNode(parent.callee) && parent.callee.name === "require";
    if (key !== "source" && !required) return;
    found.push({
      start: node.start,
      end: node.end,
      quote: file.text[node.start] ?? '"',
      parent: parent.type,
    });
  });
  return found;
}

/**
 * The edits that move a file from a module a release replaced to the one
 * that took its place: the names that went to modules of their own move
 * there, and every other declaration, `import()` and `require()` of the
 * module names the new one.
 *
 * @param file - The file's text and tree
 * @param moved - The module, where it went, and the names that went elsewhere
 * @returns The edits; none where the file names no such module
 * @example
 * ```ts
 * moveModule(file, { from: "@noverax/courier-studio-core/config", to: "@noverax/courier-build/config", elsewhere: { findMocksFile: "@noverax/courier-studio-core/mocks" } });
 * ```
 */
export function moveModule(file: ParsedFile, moved: MovedModule): TextEdit[] {
  const moves = Object.entries(moved.elsewhere).map(([name, to]) => ({
    from: moved.from,
    name,
    to,
  }));
  const edits = moveImports(file, moves);
  const body = Array.isArray(file.program.body) ? file.program.body.filter(isNode) : [];
  /* A declaration whose names all went elsewhere is moved whole with them. */
  const allElsewhere = new Set(
    body.filter((declaration) => {
      if (sourceOf(declaration) !== moved.from) return false;
      const specifiers = Array.isArray(declaration.specifiers)
        ? declaration.specifiers.filter(isNode)
        : [];
      return (
        specifiers.length > 0 &&
        specifiers.every((each) => {
          const imported = isNode(each.imported)
            ? each.imported.name
            : isNode(each.local)
              ? each.local.name
              : undefined;
          return typeof imported === "string" && imported in moved.elsewhere;
        })
      );
    }),
  );
  for (const literal of moduleLiterals(file, moved.from)) {
    const owner = body.find(
      (declaration) => isNode(declaration.source) && declaration.source.start === literal.start,
    );
    if (owner !== undefined && allElsewhere.has(owner)) continue;
    edits.push({
      start: literal.start,
      end: literal.end,
      text: `${literal.quote}${moved.to}${literal.quote}`,
    });
  }
  return edits;
}
