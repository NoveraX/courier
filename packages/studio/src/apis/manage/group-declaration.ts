import type { Expression, ObjectExpression, Program, Statement } from "oxc-parser";
import { propertyKeyName } from "../../server/mocks-edit/plan/property-key-name";
import { unwrapExpression } from "../../server/mocks-edit/plan/unwrap-expression";

const DEFINERS: ReadonlySet<string> = new Set(["defineGroup", "defineApi"]);
const API_DEFINERS: ReadonlySet<string> = new Set(["defineApi"]);

/** A group's or a flat API's declaration, and the object holding its endpoints. */
export interface GroupDeclaration {
  /** The top-level statement declaring it. */
  statement: Statement;
  /** The name it is bound to, when the binding is a plain name. */
  name: string | null;
  exported: boolean;
  endpoints: ObjectExpression;
  /** The object literal the definer is called with, `endpoints` among its properties. */
  config: ObjectExpression;
  /** The `prefix` it declares — "" when none — or `null` when it is not a string Studio can read. */
  prefix: string | null;
}

/* The object literal a definer is called with. */
function configOf(
  init: Expression | null,
  definers: ReadonlySet<string> = DEFINERS,
): ObjectExpression | null {
  if (init === null) return null;
  const call = unwrapExpression(init);
  if (call.type !== "CallExpression" || call.callee.type !== "Identifier") return null;
  if (!definers.has(call.callee.name)) return null;
  const [config] = call.arguments;
  if (config === undefined || config.type === "SpreadElement") return null;
  const object = unwrapExpression(config);
  return object.type === "ObjectExpression" ? object : null;
}

function endpointsOf(
  init: Expression | null,
  key = "endpoints",
  definers: ReadonlySet<string> = DEFINERS,
): ObjectExpression | null {
  const object = configOf(init, definers);
  if (object === null) return null;
  for (const property of object.properties) {
    if (property.type !== "Property" || property.computed) continue;
    if (propertyKeyName(property.key) !== key) continue;
    const value = unwrapExpression(property.value);
    return value.type === "ObjectExpression" ? value : null;
  }
  return null;
}

/* The prefix a declaration gives: "" when it gives none, `null` when it is not a string Studio can read. */
function prefixOf(init: Expression | null, constants: ReadonlyMap<string, string>): string | null {
  const call = init === null ? null : unwrapExpression(init);
  if (call?.type !== "CallExpression") return null;
  const [config] = call.arguments;
  const object =
    config === undefined || config.type === "SpreadElement" ? null : unwrapExpression(config);
  if (object?.type !== "ObjectExpression") return null;
  for (const property of object.properties) {
    if (property.type === "SpreadElement") return null;
    if (property.computed || propertyKeyName(property.key) !== "prefix") continue;
    return stringValue(unwrapExpression(property.value), constants);
  }
  return "";
}

/* A string literal, a template without substitutions, or a constant bound to one. */
function stringValue(value: Expression, constants: ReadonlyMap<string, string>): string | null {
  if (value.type === "Literal") return typeof value.value === "string" ? value.value : null;
  if (value.type === "TemplateLiteral")
    return value.expressions.length === 0 ? (value.quasis[0]?.value.cooked ?? null) : null;
  return value.type === "Identifier" ? (constants.get(value.name) ?? null) : null;
}

/* The file's top-level `const` bindings to a string, which a prefix may name. */
function stringConstants(program: Program): Map<string, string> {
  const constants = new Map<string, string>();
  for (const statement of program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type !== "VariableDeclaration" || declaration.kind !== "const") continue;
    for (const { id, init } of declaration.declarations) {
      const value = init === null ? null : stringValue(unwrapExpression(init), new Map());
      if (id.type === "Identifier" && value !== null) constants.set(id.name, value);
    }
  }
  return constants;
}

function declarationsIn(program: Program): GroupDeclaration[] {
  const found: GroupDeclaration[] = [];
  const constants = stringConstants(program);
  for (const statement of program.body) {
    const exported = statement.type === "ExportNamedDeclaration";
    const declaration = exported ? statement.declaration : statement;
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const declarator of declaration.declarations) {
      const endpoints = endpointsOf(declarator.init);
      const config = configOf(declarator.init);
      const name = declarator.id.type === "Identifier" ? declarator.id.name : null;
      const prefix = prefixOf(declarator.init, constants);
      if (endpoints !== null && config !== null) {
        found.push({ statement, name, exported, endpoints, config, prefix });
      }
    }
  }
  return found;
}

/**
 * Find the declaration a generated group file or flat source makes —
 * `const x = defineGroup({ … endpoints: { … } })` or `defineApi`, exported
 * or not — and the object literal holding its endpoints. With several in
 * one file, the one bound to `name` is taken, an exported one first; then
 * the first exported one; then the first.
 *
 * @param program - The parsed file
 * @param name - The name the generated declaration is bound to, when known
 * @returns The declaration, or `null` when the file has none
 * @example
 * ```ts
 * findGroupDeclaration(parseSource("index.ts", text).program, "pets")?.endpoints.properties.length;
 * ```
 */
export function findGroupDeclaration(
  program: Program,
  name?: string | null,
): GroupDeclaration | null {
  const found = declarationsIn(program);
  const named = found.filter((declaration) => name != null && declaration.name === name);
  return (
    named.find((d) => d.exported) ?? named[0] ?? found.find((d) => d.exported) ?? found[0] ?? null
  );
}

/**
 * The names of the endpoints an object literal declares. A spread or a
 * computed key names nothing Studio can tell.
 *
 * @param endpoints - The endpoints object
 * @returns The names
 */
export function endpointNames(endpoints: ObjectExpression): Set<string> {
  const names = new Set<string>();
  for (const property of endpoints.properties) {
    if (property.type !== "Property" || property.computed) continue;
    const name = propertyKeyName(property.key);
    if (name !== null) names.add(name);
  }
  return names;
}

/**
 * Find the object literal listing an API's groups: `groups` of the first
 * `defineApi({ … })` a top-level declaration makes.
 *
 * @param program - The parsed source file
 * @returns The groups object, or `null` when the file declares none
 * @example
 * ```ts
 * findApiGroups(parseSource("source.ts", text).program)?.properties.length;
 * ```
 */
export function findApiGroups(program: Program): ObjectExpression | null {
  for (const statement of program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const declarator of declaration.declarations) {
      const groups = endpointsOf(declarator.init, "groups", API_DEFINERS);
      if (groups !== null) return groups;
    }
  }
  return null;
}
