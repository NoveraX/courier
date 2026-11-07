import { type AstNode, isNode, nameOf } from "../codemod/ast";
import { keyOf } from "../codemod/literals";
import { ROUTER_PACKAGES, START_PACKAGES } from "./start-code";

/** What a name another module exports is to Start's compiler, as the graph follows it into that module: a function of Start's, and whether a call or a method made a builder of it on the way; or that the module is not one the graph read. */
export type StartResolved = { readonly fn: string; readonly built: boolean } | "unfollowed";

/** How a module's imports are followed into the modules they name: by the module, as the import writes it, and the name there. */
export type StartResolve = (source: string, name: string) => StartResolved | undefined;

/** What a module's top names that TanStack Start's compiler resolves its functions by, as it reads a module. */
export interface StartNames {
  /** Start's functions the module imports, by their local names. */
  readonly functions: ReadonlyMap<string, string>;
  /** The names it gives Start's packages taken whole. */
  readonly spaces: ReadonlySet<string>;
  /** The names it gives Router's `ClientOnly`. */
  readonly clientOnly: ReadonlySet<string>;
  /** Each binding its top declares, with the value it is declared with: none for a function's or a class's. */
  readonly bindings: ReadonlyMap<string, unknown>;
  /** What it imports from another module, by the local name: the module, and the name there, `*` for the module whole. */
  readonly elsewhere: ReadonlyMap<string, { readonly source: string; readonly name: string }>;
  /** How the caller follows what another module gives; none where it follows nothing. */
  readonly resolve?: StartResolve | undefined;
}

/** A function of Start's, by its name, or one another module gives that the caller did not follow: Start's maybe, as the compiler follows it into that module. */
export type StartFunction =
  | string
  | { readonly elsewhere: string; readonly from: string; readonly name: string };

/** Start's functions whose calls its compiler splits by side, as Start 1.169 knows them. */
export const FUNCTIONS: ReadonlySet<string> = new Set([
  "createServerFn",
  "createMiddleware",
  "createStart",
  "createIsomorphicFn",
  "createServerOnlyFn",
  "createClientOnlyFn",
]);
/** What the compiler reads through to the value inside: parentheses and TypeScript's assertions. */
export const WRAPPERS: ReadonlySet<string> = new Set([
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "TSNonNullExpression",
]);
/* Courier's own packages, which give no function of Start's. */
const COURIER = /^@noverax\//;

/**
 * A value without what the compiler reads through to it: parentheses and
 * TypeScript's assertions.
 *
 * @param node - The value
 * @returns The value inside them
 * @example
 * ```ts
 * unwrapped(init); // the Identifier createServerFn of `(createServerFn as typeof createServerFn)`
 * ```
 */
export function unwrapped(node: unknown): unknown {
  let at = node;
  while (isNode(at) && WRAPPERS.has(at.type)) at = at.expression;
  return at;
}

/** The statements at a module's top. */
export function statementsOf(program: AstNode): AstNode[] {
  return Array.isArray(program.body) ? program.body.filter(isNode) : [];
}

/* The lists a module's names are gathered into as its top is read. */
interface Gathered {
  readonly functions: Map<string, string>;
  readonly spaces: Set<string>;
  readonly clientOnly: Set<string>;
  readonly bindings: Map<string, unknown>;
  readonly elsewhere: Map<string, { readonly source: string; readonly name: string }>;
}

/* The names an import declaration gives, into the lists they belong to. */
function importNames(statement: AstNode, into: Gathered): void {
  const source = isNode(statement.source) ? String(statement.source.value) : "";
  if (statement.importKind === "type") return;
  const start = START_PACKAGES.test(source);
  const other = !start && !ROUTER_PACKAGES.test(source) && !COURIER.test(source);
  const specifiers = Array.isArray(statement.specifiers) ? statement.specifiers : [];
  for (const each of specifiers.filter(isNode)) {
    const local = nameOf(each.local);
    const imported = each.type === "ImportSpecifier" ? keyOf(each.imported) : undefined;
    if (local === undefined || each.importKind === "type") continue;
    const name = each.type === "ImportNamespaceSpecifier" ? "*" : (imported ?? "default");
    if (other) into.elsewhere.set(local, { source, name });
    if (start && name === "*") into.spaces.add(local);
    if (start && FUNCTIONS.has(name)) into.functions.set(local, name);
    if (name === "ClientOnly" && ROUTER_PACKAGES.test(source)) into.clientOnly.add(local);
  }
}

/**
 * What a module's top names that Start's compiler resolves its functions
 * by, as it reads the module: its imports — Start's functions by name or
 * as a namespace, Router's `ClientOnly`, and what it takes from any other
 * module — and each binding its top declares, with its value.
 *
 * @param program - The module's tree
 * @param resolve - How what another module gives is followed into it; none to follow nothing
 * @returns Its names
 * @example
 * ```ts
 * startNamesOf(program).bindings.get("serverFn"); // the Identifier createServerFn, for `const serverFn = createServerFn`
 * ```
 */
export function startNamesOf(program: AstNode, resolve?: StartResolve): StartNames {
  const into: Gathered = {
    functions: new Map(),
    spaces: new Set(),
    clientOnly: new Set(),
    bindings: new Map(),
    elsewhere: new Map(),
  };
  for (const statement of statementsOf(program)) {
    if (statement.type === "ImportDeclaration") importNames(statement, into);
    const declared = statement.type.startsWith("Export") ? statement.declaration : statement;
    if (!isNode(declared)) continue;
    const declarators = declared.type === "VariableDeclaration" ? declared.declarations : [];
    for (const each of Array.isArray(declarators) ? declarators.filter(isNode) : [])
      if (isNode(each.id) && each.id.type === "Identifier")
        into.bindings.set(String(each.id.name), each.init);
    const named = declared.type === "FunctionDeclaration" || declared.type === "ClassDeclaration";
    if (named && isNode(declared.id)) into.bindings.set(String(declared.id.name), null);
  }
  return { ...into, resolve };
}

/* What a name another module gives is as a function, as the caller follows it: Start's, where no call made it; unknown where the caller cannot follow it, or follows nothing. */
function given(names: StartNames, local: string, from: string, name: string, built: boolean) {
  const found = names.resolve?.(from, name);
  if (names.resolve === undefined || found === "unfollowed")
    return { elsewhere: local, from, name };
  return found !== undefined && (built || !found.built) ? found.fn : undefined;
}

/**
 * The function of Start's a value is, as the compiler resolves it by the
 * module's top: an import of it, a binding declared with one,
 * `const serverFn = createServerFn`, or, as a callee, a member of a
 * namespace — Start's, or another module's the caller follows; or one
 * another module gives that the caller does not follow.
 *
 * @param names - The module's names
 * @param node - The value
 * @param callee - Whether it is what a call calls, where a namespace's member is followed
 * @param built - Whether a builder made of the function counts, as a chain's start does
 * @param seen - The bindings followed on the way
 * @returns The function, or none
 * @example
 * ```ts
 * functionOf(names, call.callee, true); // "createServerFn" for `serverFn()` beside `const serverFn = createServerFn`
 * ```
 */
export function functionOf(
  names: StartNames,
  node: unknown,
  callee = false,
  built = false,
  seen = new Set<string>(),
): StartFunction | undefined {
  const value = unwrapped(node);
  if (!isNode(value)) return undefined;
  if (value.type === "MemberExpression") {
    const space = callee && value.computed !== true ? nameOf(value.object) : undefined;
    const property = nameOf(value.property) ?? "";
    const other = space === undefined ? undefined : names.elsewhere.get(space);
    if (space !== undefined && names.spaces.has(space))
      return FUNCTIONS.has(property) ? property : undefined;
    return other?.name === "*"
      ? given(names, `${space}.${property}`, other.source, property, built)
      : undefined;
  }
  if (value.type !== "Identifier") return undefined;
  const name = String(value.name);
  const other = names.elsewhere.get(name);
  const own = names.functions.get(name);
  if (own !== undefined || other !== undefined)
    return (
      own ??
      (other?.name === "*"
        ? undefined
        : given(names, name, other?.source ?? "", other?.name ?? "", built))
    );
  if (seen.has(name)) return undefined;
  seen.add(name);
  return functionOf(names, names.bindings.get(name), false, built, seen);
}

/**
 * The function of Start's a value is made of, as the compiler resolves
 * it: the function itself, a call of it, a method of what that gives, or
 * a binding declared with one, `const base = createServerFn({ method: "GET" })`,
 * or one another module gives built so.
 *
 * @param names - The module's names
 * @param node - The value
 * @param seen - The bindings followed on the way
 * @returns The function, or none
 * @example
 * ```ts
 * builtFrom(names, callee.object); // "createServerFn" for `base` in `base.handler(fn)`
 * ```
 */
export function builtFrom(
  names: StartNames,
  node: unknown,
  seen = new Set<string>(),
): StartFunction | undefined {
  const value = unwrapped(node);
  if (!isNode(value)) return undefined;
  const own = functionOf(names, value, false, true, new Set(seen));
  if (own !== undefined) return own;
  if (value.type === "CallExpression")
    return (
      functionOf(names, value.callee, true, true, new Set(seen)) ??
      builtFrom(names, value.callee, seen)
    );
  if (value.type === "MemberExpression" && value.computed !== true)
    return builtFrom(names, value.object, seen);
  if (value.type !== "Identifier" || seen.has(String(value.name))) return undefined;
  seen.add(String(value.name));
  return builtFrom(names, names.bindings.get(String(value.name)), seen);
}
