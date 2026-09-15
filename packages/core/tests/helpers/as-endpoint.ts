import { ENDPOINT_SCHEMA } from "../../src/define/marker";
import type { SchemaMetadata } from "../../src/validation";

/**
 * Wrap a bare closure in the descriptor shape the runtime resolves.
 *
 * Lets a test supply a spy as an endpoint without going through the builder,
 * so assertions about how the closure was invoked stay possible.
 */
export function asEndpoint(
  probe: (...args: never[]) => unknown,
  schema: SchemaMetadata = {},
): Record<string, unknown> {
  return {
    [ENDPOINT_SCHEMA]: schema,
    kind: schema.type ?? "query",
    method: "get",
    path: "",
    probe,
    options: { middleware: [], allowedHeaders: [], meta: {}, tags: [], inherit: true },
  };
}
