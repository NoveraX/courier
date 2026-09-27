/**
 * Schema-level diffing between two parsed specs.
 */

import { ownValue } from "../own-value";
import type { DigestSchema, SchemaDiff } from "./types";

function compareSchemas(oldSchema: DigestSchema, newSchema: DigestSchema): string[] {
  const changes: string[] = [];

  if (oldSchema.type !== newSchema.type) {
    changes.push(`type changed: ${oldSchema.type} → ${newSchema.type}`);
  }

  const oldProps = new Set(Object.keys(oldSchema.properties ?? {}));
  const newProps = new Set(Object.keys(newSchema.properties ?? {}));

  for (const prop of newProps) {
    if (!oldProps.has(prop)) changes.push(`field added: ${prop}`);
  }
  for (const prop of oldProps) {
    if (!newProps.has(prop)) changes.push(`field removed: ${prop}`);
  }

  for (const prop of oldProps) {
    if (!newProps.has(prop)) continue;
    const oldProp = oldSchema.properties?.[prop];
    const newProp = newSchema.properties?.[prop];
    if (!oldProp || !newProp) continue;

    if (oldProp.type !== newProp.type) {
      changes.push(`field "${prop}" type changed: ${oldProp.type} → ${newProp.type}`);
    }
    if (oldProp.required !== newProp.required) {
      const status = newProp.required ? "became required" : "became optional";
      changes.push(`field "${prop}" ${status}`);
    }
  }

  return changes;
}

export function diffSchemas(
  oldSchemas: Record<string, DigestSchema>,
  newSchemas: Record<string, DigestSchema>,
): SchemaDiff[] {
  const result: SchemaDiff[] = [];
  const oldNames = new Set(Object.keys(oldSchemas));
  const newNames = new Set(Object.keys(newSchemas));

  for (const name of newNames) {
    if (!oldNames.has(name)) result.push({ name, type: "added" });
  }

  for (const name of oldNames) {
    if (!newNames.has(name)) result.push({ name, type: "removed" });
  }

  for (const name of oldNames) {
    if (!newNames.has(name)) continue;
    const oldSchema = ownValue(oldSchemas, name);
    const newSchema = ownValue(newSchemas, name);
    if (!oldSchema || !newSchema) continue;

    const changes = compareSchemas(oldSchema, newSchema);
    if (changes.length > 0) {
      result.push({ name, type: "modified", changes });
    }
  }

  return result;
}
