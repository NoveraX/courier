import type { Sources } from "@noverax/nexus/define";
import type { SourceMap } from "./events";

const ENDPOINT_SCHEMA = Symbol.for("nexus.endpoint.schema");

interface SchemaMetadata {
  response?: unknown;
  variables?: unknown;
  type?: "query" | "mutation";
}

/** Extract a SourceMap from Sources for DevTools connection:init */
export function extractSourceMap(sources: Sources): SourceMap {
  const result: SourceMap = {};

  for (const [sourceName, source] of Object.entries(sources)) {
    const options = source.options;
    const groups: SourceMap[string]["groups"] = {};
    const mwNames = extractMiddlewareNames(options);

    /* Extract grouped endpoints */
    if (options && "groups" in options && options.groups) {
      for (const [groupName, group] of Object.entries(
        options.groups as Record<string, Record<string, unknown>>,
      )) {
        const groupOptions = (group as { options?: { prefix?: string } }).options;
        groups[groupName] = {
          prefix: groupOptions?.prefix ?? "",
          endpoints: extractEndpoints(group, mwNames),
        };
      }
    }

    /* Extract flat endpoints (top-level on source, supports mixed mode) */
    const flatEndpoints = extractEndpoints(source as unknown as Record<string, unknown>, mwNames);
    if (Object.keys(flatEndpoints).length > 0) {
      groups[""] = { prefix: "", endpoints: flatEndpoints };
    }

    result[sourceName] = {
      baseURL: options?.baseURL ?? "",
      groups,
    };
  }

  return result;
}

/** Pull middleware function names from source options */
function extractMiddlewareNames(options: Record<string, unknown> | undefined): string[] {
  if (!options || !Array.isArray(options.middleware)) return [];
  return (options.middleware as Array<(...args: unknown[]) => unknown>).map(
    (fn, i) => fn.name || `middleware[${i}]`,
  );
}

function extractEndpoints(
  obj: Record<string, unknown>,
  middlewareNames: string[],
): SourceMap[string]["groups"][string]["endpoints"] {
  const endpoints: SourceMap[string]["groups"][string]["endpoints"] = {};

  for (const [name, fn] of Object.entries(obj)) {
    if (name === "options" || typeof fn !== "function") continue;

    const schema = (fn as unknown as Record<symbol, SchemaMetadata | undefined>)[ENDPOINT_SCHEMA];
    const path = probeEndpointPath(fn as (...args: unknown[]) => unknown);

    const variablesStub = schema?.variables ? extractSchemaStub(schema.variables) : undefined;

    endpoints[name] = {
      type: schema?.type,
      hasVariablesSchema: !!schema?.variables,
      hasResponseSchema: !!schema?.response,
      ...(middlewareNames.length > 0 && { middleware: middlewareNames }),
      ...(path && { path }),
      ...(variablesStub && { variablesStub }),
    };
  }

  return endpoints;
}

/**
 * Extract a default-values stub from a Standard Schema (Zod, Valibot, etc.).
 * Returns `{ fieldName: defaultValue }` or undefined if introspection fails.
 */
function extractSchemaStub(schema: unknown): Record<string, unknown> | undefined {
  try {
    // Zod: schema.shape → { field: ZodType }
    const shape = (schema as { shape?: Record<string, unknown> }).shape;
    if (shape && typeof shape === "object") {
      const stub: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(shape)) {
        stub[key] = inferZodDefault(field);
      }
      return Object.keys(stub).length > 0 ? stub : undefined;
    }

    // Valibot: schema.entries → { field: SchemaType }
    const entries = (schema as { entries?: Record<string, unknown> }).entries;
    if (entries && typeof entries === "object") {
      const stub: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(entries)) {
        stub[key] = inferValibotDefault(field);
      }
      return Object.keys(stub).length > 0 ? stub : undefined;
    }
  } catch {
    // Schema introspection is best-effort
  }
  return undefined;
}

/** Infer a default value from a Zod field type (supports v3 + v4) */
function inferZodDefault(field: unknown): unknown {
  // Zod v4: field._zod.def.type → "string", "number", etc.
  const zodV4 = (field as { _zod?: { def?: { type?: string; innerType?: unknown } } })?._zod?.def;
  if (zodV4?.type) {
    switch (zodV4.type) {
      case "string":
        return "";
      case "number":
      case "bigint":
        return 0;
      case "boolean":
        return false;
      case "array":
        return [];
      case "object":
        return {};
      case "optional":
      case "nullable":
        return inferZodDefault(zodV4.innerType);
      default:
        return "";
    }
  }

  // Zod v3: field._def.typeName → "ZodString", "ZodNumber", etc.
  const zodV3 = (field as { _def?: { typeName?: string; innerType?: unknown } })?._def;
  if (zodV3?.typeName) {
    switch (zodV3.typeName) {
      case "ZodString":
        return "";
      case "ZodNumber":
      case "ZodBigInt":
        return 0;
      case "ZodBoolean":
        return false;
      case "ZodArray":
        return [];
      case "ZodObject":
        return {};
      case "ZodOptional":
      case "ZodNullable":
        return inferZodDefault(zodV3.innerType);
      default:
        return "";
    }
  }

  return "";
}

/** Infer a default value from a Valibot field type */
function inferValibotDefault(field: unknown): unknown {
  const type = (field as { type?: string })?.type;
  if (!type) return "";
  switch (type) {
    case "string":
      return "";
    case "number":
    case "bigint":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return "";
  }
}

/**
 * Probes an endpoint function with a mock http client to capture
 * the path template (e.g. ":id") passed to http.get/post/etc.
 */
function probeEndpointPath(fn: (...args: unknown[]) => unknown): string | undefined {
  let captured: string | undefined;

  const handler: ProxyHandler<object> = {
    get:
      () =>
      (...args: unknown[]) => {
        if (typeof args[0] === "string") captured = args[0];
        return Promise.resolve({});
      },
  };

  const mockHttp = new Proxy({}, handler);

  try {
    fn(mockHttp, {});
  } catch {
    // Endpoint may throw during probing — that's fine, path is already captured
  }

  return captured || undefined;
}
