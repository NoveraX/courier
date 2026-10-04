/**
 * ArkType schema generation from parsed schemas.
 *
 * Every function returns code for an ArkType type object.
 */

import type { ParsedSchema, ParsedSchemaProperty } from "../parser/types";
import { arkExpressionOf, withArkChecks } from "./arktype-checks";
import { arkExpression, enumerated } from "./arktype-expression";
import { jsLiteral } from "./literals";

/**
 * How to name a schema that sits on the same reference cycle as the one
 * being written. ArkType builds a schema the moment it is declared, so such a
 * reference has to be deferred until validation.
 */
export interface LazyTarget {
  /** ArkType expression for the values the target can hold, such as `object`. */
  base: string;
  /** TypeScript type the target produces, when one is written. */
  typeName?: string;
}

/** Schemas that must be named lazily, by name. */
export type LazyTargets = ReadonlyMap<string, LazyTarget>;

/** Build a type object from an ArkType expression. */
function arkType(expression: string): string {
  return `type(${jsLiteral(expression)})`;
}

function reference(name: string, lazy?: LazyTargets): string {
  const target = lazy?.get(name);
  if (!target) return `${name}Schema`;
  const cast = target.typeName ? `.as<${target.typeName}>()` : "";
  return `lazy(${arkType(target.base)}, () => ${name}Schema)${cast}`;
}

export function schemaToArkType(schema: ParsedSchema, lazy?: LazyTargets): string {
  if (schema.type === "ref" && schema.refName) return reference(schema.refName, lazy);

  if (schema.type === "array") {
    const items = schema.items ? schemaToArkType(schema.items, lazy) : arkType("unknown");
    return withArkChecks(`${items}.array()`, schema.constraints);
  }

  if (schema.type === "enum" && schema.enum) return enumerated(schema.enum, false);

  if (schema.type === "union" && schema.variants?.length) {
    return unionOf(schema.variants.map((variant) => schemaToArkType(variant, lazy)));
  }

  if (schema.type === "object" && schema.properties) {
    const required = new Set(schema.required ?? []);
    const propLines: string[] = [];
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (!name) continue;
      const key = required.has(name) ? name : `${name}?`;
      propLines.push(`  ${jsLiteral(key)}: ${propToArkType(prop, lazy)}`);
    }
    if (propLines.length === 0) return mapOf(schema.valueType, lazy);
    return objectOf(propLines);
  }

  const { constraints } = schema;
  return withArkChecks(
    arkType(arkExpressionOf(arkExpression(schema.type), constraints)),
    constraints,
  );
}

export function propToArkType(prop: ParsedSchemaProperty, lazy?: LazyTargets): string {
  if (prop.enum && !prop.refName && !prop.shape && !prop.valueType) {
    return enumerated(prop.enum, prop.nullable === true);
  }

  /* A primitive is one ArkType string, so null joins the text — unless it is
     checked, when the checks are chained onto its type and null joins that. */
  const text = propText(prop);
  if (text !== undefined && !prop.constraints) {
    return arkType(prop.nullable ? `${text} | null` : text);
  }
  if (text !== undefined) {
    const checked = withArkChecks(
      arkType(arkExpressionOf(text, prop.constraints)),
      prop.constraints,
    );
    return prop.nullable ? `${checked}.or("null")` : checked;
  }

  const value = propStructure(prop, lazy);
  return prop.nullable ? unionOf([value, arkType("null")]) : value;
}

export function primitiveToArkType(type: string, format?: string): string {
  return arkType(arkExpression(type, format));
}

/** The ArkType text for a property that needs no other type object. */
function propText(prop: ParsedSchemaProperty): string | undefined {
  if (prop.refName || prop.shape || prop.valueType) return undefined;
  if (prop.type === "array" && prop.items) return undefined;
  if (prop.type === "object") return "Record<string, unknown>";
  return arkExpression(prop.type, prop.format);
}

function propStructure(prop: ParsedSchemaProperty, lazy?: LazyTargets): string {
  if (prop.refName) return reference(prop.refName, lazy);
  if (prop.shape) return schemaToArkType(prop.shape, lazy);
  if (prop.valueType) return mapOf(prop.valueType, lazy);
  const items = prop.items ? schemaToArkType(prop.items, lazy) : arkType("unknown");
  return withArkChecks(`${items}.array()`, prop.constraints);
}

function objectOf(propLines: string[]): string {
  return `type({\n${propLines.join(",\n")},\n})`;
}

/** A map whose keys are free, typed by its value schema when there is one. */
function mapOf(valueType: ParsedSchema | undefined, lazy?: LazyTargets): string {
  if (!valueType) return arkType("Record<string, unknown>");
  return objectOf([`  "[string]": ${schemaToArkType(valueType, lazy)}`]);
}

/**
 * Join alternatives. ArkType's tuple form takes exactly two operands, so a
 * longer union nests: `[[A, "|", B], "|", C]`.
 */
function unionOf(variants: string[]): string {
  const [first, ...rest] = variants;
  if (first === undefined) return arkType("never");
  if (rest.length === 0) return first;
  return `type(${rest.reduce((joined, variant) => `[${joined}, "|", ${variant}]`, first)})`;
}
