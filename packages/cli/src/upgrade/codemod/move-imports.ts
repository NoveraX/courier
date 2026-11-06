import type { TextEdit } from "../migration";
import type { AstNode } from "./ast";
import type { ParsedFile, Pending } from "./codemod-types";
import { type NamedImport, namedImports } from "./imports";
import { canRename, renameEdits } from "./rename-binding";
import { addedToDeclaration, declarationText, removalEdits } from "./specifier-lists";

/** A name a release moved to another module, renamed or not. */
export interface MovedName {
  /** The module that exported it. */
  readonly from: string;
  readonly name: string;
  /** The module that exports it now: `from` itself, where it was only renamed. */
  readonly to: string;
  /** Its new name, where it was renamed. */
  readonly as?: string | undefined;
}

/*
 * How a moved name is written now. An export from the module keeps the
 * name the file exports; an import written with `as` keeps its binding;
 * a renamed one takes the new name where every reference can be renamed
 * for certain, and is imported under its old name otherwise.
 */
function specOf(named: NamedImport, move: MovedName, file: ParsedFile, edits: TextEdit[]): string {
  const to = move.as ?? named.imported;
  if (named.kind === "export" || named.local !== named.imported || to === named.local)
    return to === named.local ? to : `${to} as ${named.local}`;
  if (!canRename(file.program, named.local, to)) return `${to} as ${named.local}`;
  edits.push(...renameEdits(file.program, named.local, to));
  return to;
}

function moveOf(named: NamedImport, moves: readonly MovedName[]): MovedName | undefined {
  return moves.find((move) => move.from === named.module && move.name === named.imported);
}

/**
 * The edits that carry a file's imports of names a release moved or
 * renamed over to where they are now: each name taken out of its old
 * declaration — the declaration removed where nothing is left of it —
 * and put in a declaration of its new module the file has, or a new one
 * beside the old, in the file's quotes and semicolons. A name the file
 * exports from the module keeps the name the file exports it under, so
 * the file's own exports stay as they were.
 *
 * @param file - The file's text and tree
 * @param moves - The names moved
 * @returns The edits; none where the file imports none of them
 * @example
 * ```ts
 * moveImports(file, [{ from: "@noverax/courier", name: "TimeoutError", to: "@noverax/courier/realtime", as: "RealtimeTimeoutError" }]);
 * ```
 */
export function moveImports(file: ParsedFile, moves: readonly MovedName[]): TextEdit[] {
  const named = namedImports(file.program, new Set(moves.map((move) => move.from)));
  const edits: TextEdit[] = [];
  const pending = new Map<
    string,
    { anchor: AstNode; kind: "import" | "export"; to: string; names: Pending[] }
  >();
  const leaving = new Map<AstNode, Set<AstNode>>();
  for (const each of named) {
    const move = moveOf(each, moves);
    if (move === undefined) continue;
    const spec = specOf(each, move, file, edits);
    const inline =
      each.typeOnly &&
      each.declaration[each.kind === "import" ? "importKind" : "exportKind"] !== "type";
    if (move.to === each.module) {
      edits.push({
        start: each.specifier.start,
        end: each.specifier.end,
        text: `${inline ? "type " : ""}${spec}`,
      });
      continue;
    }
    const key = `${each.kind} ${move.to}`;
    const group = pending.get(key) ?? {
      anchor: each.declaration,
      kind: each.kind,
      to: move.to,
      names: [],
    };
    group.names.push({ spec, typeOnly: each.typeOnly });
    pending.set(key, group);
    leaving.set(each.declaration, (leaving.get(each.declaration) ?? new Set()).add(each.specifier));
  }
  const whole = new Set<AstNode>();
  for (const [declaration, specifiers] of leaving) {
    const removal = removalEdits(file.text, declaration, specifiers);
    if (removal === "whole") whole.add(declaration);
    else edits.push(...removal);
  }
  const placed = new Map<AstNode, string[]>();
  for (const group of pending.values()) {
    const added = addedToDeclaration(file, group.kind, group.to, group.names, whole);
    if (added !== undefined) edits.push(added);
    else
      placed.set(group.anchor, [...(placed.get(group.anchor) ?? []), declarationText(file, group)]);
  }
  return [...edits, ...placements(file.text, whole, placed)];
}

/* The new declarations, each beside the old one it takes names from — or in its place, where nothing is left of the old. */
function placements(
  text: string,
  whole: ReadonlySet<AstNode>,
  placed: ReadonlyMap<AstNode, readonly string[]>,
): TextEdit[] {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const edits: TextEdit[] = [];
  for (const declaration of whole) {
    const texts = placed.get(declaration) ?? [];
    const after = text.startsWith(newline, declaration.end) ? newline.length : 0;
    const end = texts.length === 0 ? declaration.end + after : declaration.end;
    edits.push({ start: declaration.start, end, text: texts.join(newline) });
  }
  for (const [declaration, texts] of placed) {
    if (!whole.has(declaration))
      edits.push({
        start: declaration.end,
        end: declaration.end,
        text: texts.map((each) => `${newline}${each}`).join(""),
      });
  }
  return edits;
}
