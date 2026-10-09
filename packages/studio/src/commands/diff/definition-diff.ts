import { operationChanges, type PlacedOperation } from "./operation-changes";
import type { DefinitionChange } from "./schema-changes";
import type { Schema } from "./schema-relation";

/** The changes to one endpoint, by source and name. */
export interface EndpointChanges {
  source: string;
  /** Its call in the client: `orders.get` */
  endpoint: string;
  /** Its route in the new definition, or the base one's when it is gone: `GET /orders/{id}` */
  route: string;
  changes: DefinitionChange[];
}

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace", "query"];

/**
 * The changes between two versions of a project's definition, as OpenAPI
 * documents by source: each endpoint matched by its name — so a route that
 * moved is a route changed, not one removed and another added — with what
 * changed in what its calls send and get back. A source or an endpoint
 * gone breaks its callers; a new one breaks none.
 *
 * @param base - The base definition's documents, by source
 * @param head - The new definition's documents, by source
 * @returns The endpoints that changed, the most breaking first
 * @example
 * ```ts
 * diffDefinitions({ shop: oldDocument }, { shop: newDocument });
 * ```
 */
export function diffDefinitions(
  base: Readonly<Record<string, Schema>>,
  head: Readonly<Record<string, Schema>>,
): EndpointChanges[] {
  const changed: EndpointChanges[] = [];
  for (const source of new Set([...Object.keys(base), ...Object.keys(head)])) {
    const before = operationsOf(inlined(base[source]));
    const after = operationsOf(inlined(head[source]));
    const resolve = (schema: Schema): Schema => schema;
    for (const [endpoint, old] of before) {
      const now = after.get(endpoint);
      if (!now) {
        changed.push(
          endpointOf(source, endpoint, old, [
            {
              severity: "breaking",
              kind: "endpoint-removed",
              place: "",
              message: `${endpoint} is no longer defined`,
            },
          ]),
        );
        continue;
      }
      const changes = operationChanges(old, now, resolve);
      if (changes.length > 0) changed.push(endpointOf(source, endpoint, now, changes));
    }
    for (const [endpoint, now] of after) {
      if (!before.has(endpoint)) {
        changed.push(
          endpointOf(source, endpoint, now, [
            { severity: "info", kind: "endpoint-added", place: "", message: `${endpoint} is new` },
          ]),
        );
      }
    }
  }
  const rank = (entry: EndpointChanges) =>
    Math.min(
      ...entry.changes.map((change) => ["breaking", "warning", "info"].indexOf(change.severity)),
    );
  return changed.sort((a, b) => rank(a) - rank(b));
}

function endpointOf(
  source: string,
  endpoint: string,
  placed: PlacedOperation,
  changes: DefinitionChange[],
): EndpointChanges {
  return { source, endpoint, route: `${placed.method.toUpperCase()} ${placed.path}`, changes };
}

function operationsOf(document: Schema | undefined): Map<string, PlacedOperation> {
  const operations = new Map<string, PlacedOperation>();
  const paths = isSchema(document?.paths) ? document.paths : {};
  for (const [path, route] of Object.entries(paths)) {
    if (!isSchema(route)) continue;
    for (const method of METHODS) {
      const operation = route[method];
      if (!isSchema(operation)) continue;
      const name =
        typeof operation.operationId === "string" ? operation.operationId : `${method} ${path}`;
      operations.set(name, { method, path, operation });
    }
  }
  return operations;
}

/* Each `#/components/schemas/…` reference replaced by the schema it names in its own document,
   so the same name in two versions is never mistaken for one schema; a reference to itself stops. */
function inlined(document: Schema | undefined): Schema | undefined {
  if (!document) return undefined;
  const schemas =
    isSchema(document.components) && isSchema(document.components.schemas)
      ? document.components.schemas
      : {};
  const walk = (value: unknown, seen: ReadonlySet<string>): unknown => {
    if (Array.isArray(value)) return value.map((item) => walk(item, seen));
    if (!isSchema(value)) return value;
    const ref = value.$ref;
    if (typeof ref === "string" && ref.startsWith("#/components/schemas/")) {
      const name = ref.slice("#/components/schemas/".length);
      const target = schemas[name];
      return seen.has(name) || !isSchema(target) ? value : walk(target, new Set([...seen, name]));
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, walk(inner, seen)]),
    );
  };
  const paths = walk(document.paths, new Set());
  return { ...document, paths };
}

function isSchema(value: unknown): value is Schema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
