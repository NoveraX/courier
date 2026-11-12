import type { Project } from "@noverax/create-courier/engine";

import { type AstNode, isNode, nameOf, programOf, unparenthesized } from "../codemod/ast";
import { parseCode } from "../codemod/oxc-parse";

/** What a package's config of code gives as data: the object its default export is, or what of it is not data the upgrade reads. */
export type ConfigObject =
  | { readonly file: string; readonly object: AstNode; readonly program: AstNode }
  | { readonly file: string; readonly unread: string };

/* How large a config is read: one past this is not data. */
const CONFIG_CHARS = 256 * 1024;
const FUNCTIONS = new Set(["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"]);
const ASSERTED = new Set(["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression"]);
/* How many steps an object is followed through: a `const`, a function, `defineConfig()`. */
const MAX_STEPS = 4;

/**
 * A value without the parentheses and type assertions written around it.
 *
 * @param node - The value
 * @returns The value inside them
 * @example
 * ```ts
 * bare(property.value); // the ObjectExpression of `({ root: "web" }) satisfies UserConfig`
 * ```
 */
export function bare(node: unknown): unknown {
  let at = unparenthesized(node);
  while (isNode(at) && ASSERTED.has(at.type)) at = unparenthesized(at.expression);
  return at;
}

/* A property's name, as an object literal writes it: an identifier, or a string. */
function keyOf(property: AstNode): string | undefined {
  if (property.computed === true) return undefined;
  const { key } = property;
  return nameOf(key) ?? (isNode(key) && typeof key.value === "string" ? key.value : undefined);
}

/* What a module exports as its default: `export default`, or `module.exports =`. */
function defaultOf(program: AstNode): unknown {
  for (const statement of Array.isArray(program.body) ? program.body.filter(isNode) : []) {
    if (statement.type === "ExportDefaultDeclaration") return statement.declaration;
    const assigned = statement.type === "ExpressionStatement" ? statement.expression : undefined;
    const target =
      isNode(assigned) && assigned.type === "AssignmentExpression" ? assigned.left : undefined;
    if (
      isNode(target) &&
      nameOf(target.object) === "module" &&
      nameOf(target.property) === "exports"
    )
      return isNode(assigned) ? assigned.right : undefined;
  }
  return undefined;
}

/* The value a `const` of the module's own is declared with. */
function constOf(program: AstNode, name: string): unknown {
  for (const statement of Array.isArray(program.body) ? program.body.filter(isNode) : []) {
    const declarations = statement.type === "VariableDeclaration" ? statement.declarations : [];
    for (const declarator of Array.isArray(declarations) ? declarations.filter(isNode) : [])
      if (statement.kind === "const" && nameOf(declarator.id) === name) return declarator.init;
  }
  return undefined;
}

/* The object a config gives: the object, the one a function returns, a `const`'s, or the one `defineConfig()` is given; none where it is not written as one. */
function objectOf(program: AstNode, value: unknown, steps = 0): AstNode | undefined {
  const node = bare(value);
  if (!isNode(node) || steps > MAX_STEPS) return undefined;
  if (node.type === "ObjectExpression") return node;
  if (node.type === "Identifier")
    return objectOf(program, constOf(program, String(node.name)), steps + 1);
  const [given, ...more] = Array.isArray(node.arguments) ? node.arguments : [];
  if (node.type === "CallExpression" && nameOf(node.callee) === "defineConfig")
    return more.length === 0 ? objectOf(program, given, steps + 1) : undefined;
  if (!FUNCTIONS.has(node.type)) return undefined;
  const body = bare(node.body);
  if (isNode(body) && body.type === "ObjectExpression") return body;
  const statements = isNode(body) && Array.isArray(body.body) ? body.body.filter(isNode) : [];
  const returned = statements.filter((each) => each.type === "ReturnStatement").at(-1);
  return returned === undefined ? undefined : objectOf(program, returned.argument, steps + 1);
}

/**
 * A package's config of code, read without running it: the object its
 * default export gives — the object, one a function returns, a `const`'s,
 * or the one `defineConfig()` is given — from the first of the files
 * that is there; what of it is not data, where it is not written so.
 *
 * @param project - The package
 * @param files - The config's files, in the order the tool looks for one
 * @returns The object and the config's tree, what is not read of it, or none where no file is there
 * @example
 * ```ts
 * configObject(project, ["vite.config.ts"]); // { file: "vite.config.ts", object }
 * ```
 */
export function configObject(project: Project, files: readonly string[]): ConfigObject | undefined {
  const file = files.find((each) => project.exists(each));
  if (file === undefined) return undefined;
  const text = project.read(file) ?? "";
  const parsed = text.length > CONFIG_CHARS ? undefined : parseCode(file, text);
  if (parsed === undefined || parsed.errors.length > 0) return { file, unread: "it" };
  const program = programOf(parsed.program);
  const object = objectOf(program, defaultOf(program));
  return object === undefined ? { file, unread: "its default export" } : { file, object, program };
}

/**
 * A property of an object literal, by its name.
 *
 * @param object - The object
 * @param name - The property's name
 * @returns Its value, or `undefined` where the object writes none of the name
 * @example
 * ```ts
 * propertyOf(config, "root"); // the Literal "web"
 * ```
 */
export function propertyOf(object: AstNode, name: string): unknown {
  const properties = Array.isArray(object.properties) ? object.properties.filter(isNode) : [];
  return properties.find((each) => each.type === "Property" && keyOf(each) === name)?.value;
}

/**
 * Whether a list of an object's properties, or of an array's elements,
 * spreads another into it.
 *
 * @param list - The properties or the elements
 * @returns Whether one of them is a spread
 * @example
 * ```ts
 * spreads(config.properties); // true for `{ ...base, root: "web" }`
 * ```
 */
export function spreads(list: unknown): boolean {
  return Array.isArray(list) && list.some((each) => isNode(each) && each.type === "SpreadElement");
}
