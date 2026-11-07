import { type AstNode, isNode, type Visited } from "../codemod/ast";
import { referencesTo } from "../codemod/binding-references";
import { type StartResolve, startNamesOf } from "./start-calls";
import { dropsAt, inside, routeOptionsOf, type StartRead, type StartSide } from "./start-drops";

/** Whether each side's build keeps a binding, or a node of code, as TanStack Start builds a module both load. */
export type StartKept = Readonly<Record<StartSide, boolean>>;

/** What each side's build keeps of a module's code: a binding, by its identifier, and a node, by where it is; and, where the split guesses, the functions of other modules it took for Start's. */
export interface StartSplit {
  readonly binding: (binding: AstNode) => StartKept;
  readonly node: (at: Visited) => StartKept;
  readonly guessed?: ReadonlyMap<string, string> | undefined;
  /** The functions of other modules it did not follow that it met where a call it reads may take code out, so far. */
  readonly met: ReadonlyMap<string, string>;
}

/** How a module's split reads it: whether it takes a function another module gives for one of Start's, and how what other modules give is followed into them. */
export interface SplitOptions {
  readonly guess?: boolean | undefined;
  readonly resolve?: StartResolve | undefined;
}

/* How many bindings a module's split follows to the code that uses them: past this, a binding is kept. */
const MAX_STEPS = 256;

/* The binding whose declaration holds a reference, which Start's build drops with it where nothing it keeps uses it: a declarator's, the reference in its value, or a function declaration's; none for one the module exports. */
function declaredBy(ancestors: readonly AstNode[], at: number, node: AstNode): AstNode | undefined {
  const owner = ancestors[at];
  const exported = (above: AstNode | undefined) => above?.type.startsWith("Export") === true;
  if (owner?.type === "VariableDeclarator" && isNode(owner.id) && inside(node, owner.init))
    return owner.id.type === "Identifier" && !exported(ancestors[at - 2]) ? owner.id : undefined;
  if (owner?.type !== "FunctionDeclaration" || !isNode(owner.id) || exported(ancestors[at - 1]))
    return undefined;
  return owner.id === node ? undefined : owner.id;
}

/* Whether a reference writes its binding, which keeps it as Babel's dead code elimination reads it. */
function writes({ ancestors, key }: Visited): boolean {
  const parent = ancestors.at(-1);
  return (
    (parent?.type === "AssignmentExpression" && key === "left") ||
    parent?.type === "UpdateExpression"
  );
}

/**
 * What each side's build keeps of a module's code as TanStack Start
 * builds it: each drops the code `dropsAt` gives it, then each
 * declaration nothing it keeps uses, and the imports only they did, as
 * the dead code elimination after Start's compiler and router does. A
 * binding no code uses is kept, as both keep it. Where the split
 * guesses, a function another module gives is taken for Start's by the
 * method its chain ends with, which the compiler follows into that
 * module and the upgrade does not.
 *
 * @param program - The module's tree
 * @param route - Whether Start's router reads the module as a route
 * @param options - Whether it takes another module's function for one of Start's, and how it follows what other modules give
 * @returns What each side's build keeps of a binding, and of a node
 * @example
 * ```ts
 * startSplit(program, true).binding(specifier.local); // { page: false, server: true } where only a server function's handler uses it
 * ```
 */
export function startSplit(
  program: AstNode,
  route: boolean,
  options: SplitOptions = {},
): StartSplit {
  const read: StartRead = {
    names: startNamesOf(program, options.resolve),
    options: route ? routeOptionsOf(program) : new Set(),
    guessed: options.guess === true ? new Map() : undefined,
    met: new Map(),
  };
  const references = new Map<AstNode, Visited[]>();
  const known: Record<StartSide, Map<AstNode, boolean>> = { page: new Map(), server: new Map() };
  let steps = 0;
  /* Whether a side's build keeps a binding: whether code it keeps uses it, past the bindings followed to it. */
  const keeps = (binding: AstNode, side: StartSide, open: Set<AstNode>): boolean => {
    const found = known[side].get(binding);
    if (found !== undefined) return found;
    if (open.has(binding)) return false;
    if (++steps > MAX_STEPS) return true;
    const uses = references.get(binding) ?? referencesTo(program, binding);
    references.set(binding, uses);
    open.add(binding);
    const kept = uses.length === 0 || uses.some((use) => writes(use) || survives(use, side, open));
    open.delete(binding);
    if (kept || open.size === 0) known[side].set(binding, kept);
    return kept;
  };
  /* Whether a side's build keeps a node: in no code it drops, nor in a declaration it drops. */
  const survives = ({ node, ancestors }: Visited, side: StartSide, open: Set<AstNode>) => {
    for (let at = ancestors.length - 1; at >= 0; at--) {
      if (dropsAt(read, ancestors, at, node).includes(side)) return false;
      const declared = declaredBy(ancestors, at, node);
      if (declared !== undefined && !keeps(declared, side, open)) return false;
    }
    return true;
  };
  return {
    binding: (binding) => ({
      page: keeps(binding, "page", new Set()),
      server: keeps(binding, "server", new Set()),
    }),
    node: (at) => ({
      page: survives(at, "page", new Set()),
      server: survives(at, "server", new Set()),
    }),
    guessed: read.guessed,
    met: read.met,
  };
}
