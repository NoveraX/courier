import { type AstNode, isNode, nameOf, type Visited, walk } from "./ast";

/**
 * What an identifier of a name stands for where it is written: a
 * reference to a binding, a binding itself — a declaration, a parameter,
 * an import — or the name of something else, such as a property, a key or
 * a label, which no binding of the name changes.
 */
export type IdentifierRole = "reference" | "binding" | "name";

/** An identifier of a name, where it is and what it stands for. */
export interface Occurrence {
  readonly node: AstNode;
  readonly role: IdentifierRole;
  /** Where one identifier is both a name and a reference: `{ x }` in an object, `export { x }`. */
  readonly shorthand?: "property" | "export" | undefined;
}

/* Fields whose identifier is a name of something else wherever it is not computed. */
const KEYED = new Set([
  "Property",
  "PropertyDefinition",
  "MethodDefinition",
  "AccessorProperty",
  "TSPropertySignature",
  "TSMethodSignature",
  "TSAbstractPropertyDefinition",
  "TSAbstractMethodDefinition",
]);
/* Nodes whose `id` declares the name. */
const DECLARING = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ClassDeclaration",
  "ClassExpression",
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSEnumDeclaration",
  "TSModuleDeclaration",
  "TSImportEqualsDeclaration",
]);
const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
const PATTERNS = new Set(["ArrayPattern", "ObjectPattern", "RestElement", "AssignmentPattern"]);

/* Whether a node in a pattern's place binds: a declarator's id, a parameter, a catch's, or inside a pattern there. */
function inPattern(parent: AstNode, key: string, grand: AstNode | undefined): boolean {
  if (parent.type === "VariableDeclarator") return key === "id";
  if (FUNCTIONS.has(parent.type)) return key === "params";
  if (parent.type === "CatchClause") return key === "param";
  if (parent.type === "TSParameterProperty") return key === "parameter";
  if (parent.type === "AssignmentPattern") return key === "left";
  if (parent.type === "Property" && grand?.type === "ObjectPattern") return key === "value";
  return PATTERNS.has(parent.type);
}

function roleOf({ ancestors, key }: Visited): Pick<Occurrence, "role" | "shorthand"> {
  const parent = ancestors.at(-1);
  const grand = ancestors.at(-2);
  if (parent === undefined) return { role: "reference" };
  const computed = parent.computed === true;
  if (parent.type === "Property" && key === "key" && !computed) return { role: "name" };
  if (parent.type === "Property" && key === "value" && parent.shorthand === true)
    return {
      role: grand?.type === "ObjectPattern" ? "binding" : "reference",
      shorthand: "property",
    };
  if (KEYED.has(parent.type) && key === "key" && !computed) return { role: "name" };
  if (
    (parent.type === "MemberExpression" || parent.type === "JSXMemberExpression") &&
    key === "property"
  )
    return { role: computed ? "reference" : "name" };
  if (parent.type === "TSQualifiedName" && key === "right") return { role: "name" };
  /* import("…").Name in a type names a module's export, not the file's binding. */
  if (parent.type === "TSImportType" && key === "qualifier") return { role: "name" };
  if (/^(Labeled|Break|Continue)Statement$/.test(parent.type) && key === "label")
    return { role: "name" };
  if (parent.type === "ImportSpecifier") return { role: key === "local" ? "binding" : "name" };
  if (parent.type === "ImportDefaultSpecifier" || parent.type === "ImportNamespaceSpecifier")
    return { role: "binding" };
  if (parent.type === "ExportSpecifier") return exportRole(parent, key, grand);
  if (DECLARING.has(parent.type) && key === "id") return { role: "binding" };
  if (parent.type === "TSTypeParameter" && key === "name") return { role: "binding" };
  if (parent.type === "TSEnumMember" || parent.type === "MetaProperty") return { role: "name" };
  if (parent.type === "JSXAttribute" || parent.type === "JSXNamespacedName")
    return { role: "name" };
  if (inPattern(parent, key, grand)) return { role: "binding" };
  return { role: "reference" };
}

/* An export's local is a reference, unless the export takes it from another module; its exported name is a name. */
function exportRole(
  parent: AstNode,
  key: string,
  grand: AstNode | undefined,
): Pick<Occurrence, "role" | "shorthand"> {
  const fromModule =
    grand?.type === "ExportNamedDeclaration" && grand.source !== null && grand.source !== undefined;
  if (key !== "local" || fromModule) return { role: "name" };
  const { local, exported } = parent;
  const shorthand = isNode(local) && isNode(exported) && local.start === exported.start;
  return { role: "reference", ...(shorthand ? { shorthand: "export" as const } : {}) };
}

/* Each tree's identifiers by name, found in one walk the first time a name of the tree is asked for: a tree is never changed, so it stays true. */
const INDEXES = new WeakMap<AstNode, ReadonlyMap<string, readonly Occurrence[]>>();

function indexOf(program: AstNode): ReadonlyMap<string, readonly Occurrence[]> {
  const known = INDEXES.get(program);
  if (known !== undefined) return known;
  const index = new Map<string, Occurrence[]>();
  walk(program, (visited) => {
    const { type } = visited.node;
    if (type !== "Identifier" && type !== "JSXIdentifier") return;
    const name = nameOf(visited.node);
    if (name === undefined) return;
    const occurrence = { node: visited.node, ...roleOf(visited) };
    const found = index.get(name);
    if (found === undefined) index.set(name, [occurrence]);
    else found.push(occurrence);
  });
  INDEXES.set(program, index);
  return index;
}

/**
 * Every identifier of a name in a file's tree — JSX's components among
 * them — with what each stands for: a reference to a binding of the name,
 * a binding, or the name of something else. The tree is walked once, the
 * first time any name of it is asked for.
 *
 * @param program - The file's tree
 * @param name - The name
 * @returns Each occurrence, in the order the walk meets them
 * @example
 * ```ts
 * occurrencesOf(program, "TimeoutError").filter((each) => each.role === "binding").length; // 1: its import
 * ```
 */
export function occurrencesOf(program: AstNode, name: string): readonly Occurrence[] {
  return indexOf(program).get(name) ?? [];
}
