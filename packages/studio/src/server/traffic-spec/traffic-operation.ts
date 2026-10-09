import type { PlacedCall } from "./openapi-from-traffic";
import type { PathTemplate } from "./path-template";
import { type JsonSchema, schemaOfSamples } from "./sample-schema";

const WITHOUT_BODY: ReadonlySet<string> = new Set(["get", "delete", "head", "options"]);

/**
 * An endpoint's operation, read from its calls: its path parameters, its
 * query — the keys its calls sent, required when every call sent them — or
 * its JSON body, and its answer: the status most of its calls got, with the
 * schema of every answer that came whole. Its name is its operation id, its
 * group its tag, so the import names it as the app does.
 *
 * @param calls - Its calls, placed on its route
 * @param template - Its route
 * @param verb - Its HTTP method, lower case
 * @returns The operation
 * @example
 * ```ts
 * endpointOperation(calls, { path: "/products/{id}", params: ["id"] }, "get");
 * ```
 */
export function endpointOperation(
  calls: readonly PlacedCall[],
  template: PathTemplate,
  verb: string,
): JsonSchema {
  const [first] = calls;
  const consumed = new Set(template.params);
  const path = template.params.map((name, at) => ({
    name,
    in: "path",
    required: true,
    schema: schemaOfSamples(
      calls.map((one) => variableOf(one.variables, name) ?? segmentAt(one, template, at)),
    ),
    description: `Inferred from traffic: in the address of ${callsText(calls.length)}.`,
  }));
  const body = WITHOUT_BODY.has(verb) ? undefined : requestBody(calls, consumed);
  return {
    operationId: first?.call.method ?? "call",
    ...(first?.call.group && { tags: [first.call.group] }),
    parameters: [...path, ...(WITHOUT_BODY.has(verb) ? queryParameters(calls) : [])],
    ...(body && { requestBody: body }),
    responses: responsesOf(calls),
  };
}

function queryParameters(calls: readonly PlacedCall[]): JsonSchema[] {
  const keys = new Set(calls.flatMap((one) => [...one.query.keys()]));
  return [...keys].map((name) => {
    const sent = calls.filter((one) => one.query.has(name));
    const typed = sent
      .map((one) => variableOf(one.variables, name))
      .filter((value) => value !== undefined);
    return {
      name,
      in: "query",
      required: sent.length === calls.length,
      schema: typed.length > 0 ? schemaOfSamples(typed) : { type: "string" },
      description: `Inferred from traffic: sent in ${sent.length === calls.length ? callsText(calls.length) : `${sent.length} of ${calls.length} calls`}.`,
    };
  });
}

function requestBody(
  calls: readonly PlacedCall[],
  consumed: ReadonlySet<string>,
): JsonSchema | undefined {
  const bodies = calls
    .map((one) => withoutKeys(one.variables, consumed))
    .filter((body) => body !== undefined);
  if (bodies.length === 0) return undefined;
  return {
    required: bodies.length === calls.length,
    content: { "application/json": { schema: schemaOfSamples(bodies, "requests") } },
  };
}

function responsesOf(calls: readonly PlacedCall[]): JsonSchema {
  const succeeded = calls.filter(
    (one) => (one.call.status ?? 0) >= 200 && (one.call.status ?? 0) < 300,
  );
  if (succeeded.length === 0) return { default: { description: "No call was seen to succeed" } };
  const status = mostCommon(succeeded.map((one) => one.call.status ?? 200));
  const answers = succeeded
    .filter((one) => one.call.status === status && !one.call.dataCut && one.call.data !== undefined)
    .map((one) => one.call.data);
  const description = `As ${succeeded.length} recorded call${succeeded.length === 1 ? "" : "s"} answered`;
  if (answers.length === 0) return { [status]: { description } };
  return {
    [status]: {
      description,
      content: { "application/json": { schema: schemaOfSamples(answers, "answers") } },
    },
  };
}

function withoutKeys(variables: unknown, consumed: ReadonlySet<string>): unknown {
  if (variables === undefined || variables === null) return undefined;
  if (typeof variables !== "object" || Array.isArray(variables)) return variables;
  const entries: Array<[string, unknown]> = Object.entries(variables);
  const kept = entries.filter(([key]) => !consumed.has(key));
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
}

function variableOf(variables: unknown, key: string): unknown {
  return isRecord(variables) ? variables[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* A parameter no variable named is read from the segment it stood in. */
function segmentAt(one: PlacedCall, template: PathTemplate, param: number): string | undefined {
  const parts = template.path.split("/").filter((part) => part !== "");
  let seen = -1;
  for (const [at, part] of parts.entries()) {
    if (part.startsWith("{") && ++seen === param) return one.segments[at];
  }
  return undefined;
}

function mostCommon(values: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 200;
}

/* Every one of a number of calls: `the one call`, `both calls`, `all 4 calls`. */
function callsText(count: number): string {
  if (count === 1) return "the one call";
  return count === 2 ? "both calls" : `all ${count} calls`;
}
