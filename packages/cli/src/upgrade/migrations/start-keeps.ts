import { type AstNode, isNode } from "../codemod/ast";
import { keyOf } from "../codemod/literals";
import { START } from "../entries/path-rules";
import type { PieceSide } from "../entries/piece-sides";
import { type StartKept, type StartSplit, startSplit } from "../entries/start-split";
import type { Taken } from "./entry-taken";
import type { KeptName, Unfollowed } from "./start-findings";

/** What each side's build keeps of the names each of a module's imports of the root takes, and the functions of other modules Courier did not follow that may take them out of a page. */
export interface StartKeeps {
  readonly kept: (taken: Taken) => KeptName[] | undefined;
  readonly unfollowed: () => readonly Unfollowed[];
}

const NONE: StartKept = { page: false, server: false };

/* What a split keeps of each binding a declaration makes, by the names it imports: a named import's by its bindings, a namespace's names by the namespace's. */
function bindingsOf(
  split: StartSplit,
  statement: AstNode,
): (name: string) => StartKept | undefined {
  const specifiers = Array.isArray(statement.specifiers) ? statement.specifiers.filter(isNode) : [];
  const space = specifiers.find((each) => each.type === "ImportNamespaceSpecifier")?.local;
  const byName = new Map<string, StartKept>();
  for (const each of specifiers) {
    const name = keyOf(each.imported);
    if (name === undefined || !isNode(each.local)) continue;
    const kept = split.binding(each.local);
    const { page, server } = byName.get(name) ?? NONE;
    byName.set(name, { page: page || kept.page, server: server || kept.server });
  }
  return (name) => (isNode(space) ? split.binding(space) : byName.get(name));
}

/**
 * What each side's build keeps of the names a module's imports of the
 * root take, where TanStack Start builds a module both sides load: a
 * named import's by its bindings, a namespace's names by the namespace's,
 * none for a default, a re-export or a load. A name the page's build
 * keeps is marked where it would not, were the functions of other
 * modules Courier did not follow Start's: the side's resolver follows
 * the rest into the modules the graph read, as Start's compiler does.
 *
 * @param side - The module's side
 * @param program - Its tree
 * @returns What each side's build keeps; none for a module Start does not build for both
 * @example
 * ```ts
 * startKeeps(side, file.program)?.kept(taken)?.[0]; // { name: "createHandler", type: false, page: false, server: true }
 * ```
 */
export function startKeeps(side: PieceSide, program: AstNode): StartKeeps | undefined {
  const start = side.framework !== undefined && START.has(side.framework);
  if (!start || !side.maybePage || !side.maybeServer) return undefined;
  const route = side.startRoute === true;
  const resolve = side.startResolve;
  const split = startSplit(program, route, { resolve });
  let guess: StartSplit | undefined;
  /* The split that takes the functions of other modules Courier did not follow for Start's, made at the first name it is asked of. */
  const guessing = () => {
    guess ??= startSplit(program, route, { guess: true, resolve });
    return guess;
  };
  return {
    kept(taken) {
      const { statement, names } = taken;
      if (statement.type !== "ImportDeclaration" || names === undefined) return undefined;
      const strict = bindingsOf(split, statement);
      const kept = names.map((each) => (each.type ? NONE : (strict(each.name) ?? NONE)));
      /* Only a function Courier did not follow, met where a call may take code out, leaves a guess to make. */
      const guessed = split.met.size === 0 ? undefined : bindingsOf(guessing(), statement);
      return names.map((each, at) => {
        const sides = kept[at] ?? NONE;
        const maybe = sides.page && guessed?.(each.name)?.page === false;
        return { ...each, ...sides, ...(maybe ? { maybe } : {}) };
      });
    },
    unfollowed: () => [...(guess?.guessed ?? [])].map(([name, from]): Unfollowed => [name, from]),
  };
}

/**
 * A module's side narrowed, for one declaration, to the side whose build
 * alone keeps its values.
 *
 * @param side - The module's side
 * @param names - What each side's build keeps of the declaration's names
 * @returns The side, narrowed where one side's build alone keeps them
 * @example
 * ```ts
 * narrowed(side, [{ name: "createHandler", type: false, page: false, server: true }]).maybePage; // false
 * ```
 */
export function narrowed(side: PieceSide, names: readonly KeptName[]): PieceSide {
  const values = names.filter(({ type }) => !type);
  const page = values.some((each) => each.page);
  if (page === values.some((each) => each.server)) return side;
  return page
    ? { ...side, maybeServer: false, serverVia: undefined }
    : { ...side, page: false, maybePage: false, pageThrough: undefined };
}
