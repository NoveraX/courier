/**
 * Breaking change classification from endpoint and schema diffs.
 */

import type { EndpointDiffResult } from "./diff-endpoints";
import type { BreakingChange, BreakingSeverity, DiffEndpoint, SchemaDiff } from "./types";

/** Map of change prefix → [severity, category] */
const ENDPOINT_CHANGE_RULES: [string, BreakingSeverity, string][] = [
  ["HTTP method changed", "breaking", "method-changed"],
  ["parameter removed", "breaking", "parameter-removed"],
  ["path changed", "breaking", "path-changed"],
  ["response type changed", "potentially-breaking", "response-changed"],
  ["request body changed", "potentially-breaking", "body-changed"],
  ["security changed", "potentially-breaking", "security-changed"],
  ["parameter added", "non-breaking", "parameter-added"],
];

/** Map of change substring → [severity, category] */
const SCHEMA_CHANGE_RULES: [string, BreakingSeverity, string][] = [
  ["field removed", "breaking", "schema-field-removed"],
  ["became required", "potentially-breaking", "schema-field-required"],
  ["type changed", "potentially-breaking", "schema-type-changed"],
  ["field added", "non-breaking", "schema-field-added"],
  ["became optional", "non-breaking", "schema-field-optional"],
];

function classifyEndpointChange(ep: DiffEndpoint, change: string): BreakingChange | null {
  const epKey = `${ep.group}.${ep.name}`;
  for (const [prefix, severity, category] of ENDPOINT_CHANGE_RULES) {
    if (change.startsWith(prefix)) {
      return { severity, category, message: `${epKey}: ${change}`, endpoint: epKey };
    }
  }
  return null;
}

function classifySchemaChange(name: string, change: string): BreakingChange | null {
  for (const [substring, severity, category] of SCHEMA_CHANGE_RULES) {
    if (change.includes(substring)) {
      return { severity, category, message: `${name}: ${change}`, schema: name };
    }
  }
  return null;
}

export function classifyBreakingChanges(
  endpointDiff: EndpointDiffResult,
  schemaChanges: SchemaDiff[],
): BreakingChange[] {
  const result: BreakingChange[] = [];

  for (const ep of endpointDiff.removed) {
    result.push({
      severity: "breaking",
      category: "endpoint-removed",
      message: `Endpoint removed: ${ep.method.toUpperCase()} ${ep.path}`,
      endpoint: `${ep.group}.${ep.name}`,
    });
  }

  for (const ep of endpointDiff.modified) {
    for (const change of ep.changes ?? []) {
      const classified = classifyEndpointChange(ep, change);
      if (classified) result.push(classified);
    }
  }

  for (const ep of endpointDiff.added) {
    result.push({
      severity: "non-breaking",
      category: "endpoint-added",
      message: `New endpoint: ${ep.method.toUpperCase()} ${ep.path}`,
      endpoint: `${ep.group}.${ep.name}`,
    });
  }

  for (const schema of schemaChanges) {
    if (schema.type === "removed") {
      result.push({
        severity: "breaking",
        category: "schema-removed",
        message: `Schema removed: ${schema.name}`,
        schema: schema.name,
      });
    } else if (schema.type === "added") {
      result.push({
        severity: "non-breaking",
        category: "schema-added",
        message: `New schema: ${schema.name}`,
        schema: schema.name,
      });
    } else if (schema.type === "modified") {
      for (const change of schema.changes ?? []) {
        const classified = classifySchemaChange(schema.name, change);
        if (classified) result.push(classified);
      }
    }
  }

  return result;
}
