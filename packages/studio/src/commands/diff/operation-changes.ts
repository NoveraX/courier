import { type DefinitionChange, type SchemaWalk, schemaChanges } from "./schema-changes";
import type { Schema } from "./schema-relation";

/** An operation of a document, where it was found. */
export interface PlacedOperation {
  method: string;
  path: string;
  operation: Schema;
}

/**
 * The changes to one endpoint between two definitions: its route, the
 * parameters and the body a call sends, and the answer it gets back.
 *
 * @param before - The endpoint in the base definition
 * @param after - The same endpoint in the new one
 * @param resolve - Follows a `$ref` to the schema it names
 * @returns The changes
 * @example
 * ```ts
 * operationChanges(base, head, resolve);
 * ```
 */
export function operationChanges(
  before: PlacedOperation,
  after: PlacedOperation,
  resolve: (schema: Schema) => Schema,
): DefinitionChange[] {
  const changes: DefinitionChange[] = [];
  if (before.method !== after.method || before.path !== after.path) {
    changes.push({
      severity: "breaking",
      kind: "route-changed",
      place: "",
      message: `was ${before.method.toUpperCase()} ${before.path}, now ${after.method.toUpperCase()} ${after.path}`,
    });
  }
  const request: SchemaWalk = { side: "request", resolve };
  changes.push(...parameterChanges(before.operation, after.operation, request));
  const sentBefore = bodyOf(before.operation);
  const sentAfter = bodyOf(after.operation);
  if (sentBefore && sentAfter)
    changes.push(...schemaChanges(sentBefore, sentAfter, request, "body"));
  else if (
    !sentBefore &&
    sentAfter &&
    after.operation.requestBody &&
    isRequiredBody(after.operation)
  ) {
    changes.push({
      severity: "breaking",
      kind: "body-required",
      place: "body",
      message: "a body must now be sent",
    });
  }
  changes.push(...answerChanges(before.operation, after.operation, { side: "response", resolve }));
  return changes;
}

function parameterChanges(before: Schema, after: Schema, walk: SchemaWalk): DefinitionChange[] {
  const was = parametersOf(before);
  const now = parametersOf(after);
  const changes: DefinitionChange[] = [];
  for (const [key, parameter] of now) {
    const old = was.get(key);
    if (!old) {
      if (parameter.required === true && parameter.in !== "path") {
        changes.push({
          severity: "breaking",
          kind: "parameter-added-required",
          place: key,
          message: `${key} must now be sent`,
        });
      } else if (parameter.in !== "path") {
        changes.push({
          severity: "info",
          kind: "parameter-added",
          place: key,
          message: `${key} may now be sent`,
        });
      }
      continue;
    }
    if (parameter.required === true && old.required !== true) {
      changes.push({
        severity: "breaking",
        kind: "parameter-required",
        place: key,
        message: `${key} must now be sent`,
      });
    }
    if (isSchema(old.schema) && isSchema(parameter.schema))
      changes.push(...schemaChanges(old.schema, parameter.schema, walk, key));
  }
  for (const key of was.keys()) {
    if (!now.has(key) && !key.startsWith("path.")) {
      changes.push({
        severity: "info",
        kind: "parameter-removed",
        place: key,
        message: `${key} is no longer read`,
      });
    }
  }
  return changes;
}

function answerChanges(before: Schema, after: Schema, walk: SchemaWalk): DefinitionChange[] {
  const was = successOf(before);
  const now = successOf(after);
  const changes: DefinitionChange[] = [];
  if (was && now && was.status !== now.status) {
    changes.push({
      severity: "warning",
      kind: "status-changed",
      place: "answer",
      message: `answers ${now.status} where it answered ${was.status}`,
    });
  }
  if (was?.schema && now && !now.schema) {
    changes.push({
      severity: "breaking",
      kind: "answer-removed",
      place: "answer",
      message: "no longer answers with a body",
    });
  }
  if (was?.schema && now?.schema)
    changes.push(...schemaChanges(was.schema, now.schema, walk, "answer"));
  return changes;
}

function parametersOf(operation: Schema): Map<string, Schema> {
  const parameters = Array.isArray(operation.parameters)
    ? operation.parameters.filter(isSchema)
    : [];
  return new Map(
    parameters.map((parameter) => [`${String(parameter.in)}.${String(parameter.name)}`, parameter]),
  );
}

function bodyOf(operation: Schema): Schema | undefined {
  const content =
    isSchema(operation.requestBody) && isSchema(operation.requestBody.content)
      ? operation.requestBody.content
      : {};
  const first = Object.values(content).find(isSchema);
  return first && isSchema(first.schema) ? first.schema : undefined;
}

function isRequiredBody(operation: Schema): boolean {
  return isSchema(operation.requestBody) && operation.requestBody.required === true;
}

/* The answer a call that succeeds gets: the first 2xx the operation declares. */
function successOf(operation: Schema): { status: string; schema: Schema | undefined } | undefined {
  const responses = isSchema(operation.responses) ? operation.responses : {};
  const status = Object.keys(responses).find((code) => /^2\d\d$/.test(code));
  if (status === undefined) return undefined;
  const response = responses[status];
  const content = isSchema(response) && isSchema(response.content) ? response.content : {};
  const first = Object.values(content).find(isSchema);
  return { status, schema: first && isSchema(first.schema) ? first.schema : undefined };
}

function isSchema(value: unknown): value is Schema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
