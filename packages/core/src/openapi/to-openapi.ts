import { getSourceName } from "../define/api";
import type { BaseOptions } from "../http-client/types";
import { eachEndpoint } from "./endpoints";
import type { ComponentSchemas } from "./json-schema";
import { operationOf } from "./operation";
import { securityOf } from "./security";
import type { JSONSchema, OpenAPIDocument, OpenAPIOptions } from "./types";

/**
 * Write an API's definition as an OpenAPI document — the one Courier's
 * import reads back — for a documentation portal, an API gateway, another
 * team's SDK generator or a contract test.
 *
 * Each endpoint becomes an operation whose id is its call in the client,
 * `billing.invoices.list`, tagged with its group. Its schemas are written
 * as JSON Schema 2020-12 through Standard JSON Schema, which Zod and
 * ArkType implement; give `jsonSchema` a converter for another library,
 * such as Valibot's `toJsonSchema`. An endpoint declared by its types
 * alone has its input and answer left unspecified. The API's `session`
 * becomes security schemes, its double-submit header required on writes.
 * A channel, an endpoint the application serves itself, and — in 3.1 —
 * a QUERY endpoint have no operation; `onSkip` hears each one and why.
 *
 * @param api - The API, as `defineApi` returns it
 * @param options - The document's version, info and servers, a schema converter, and `onSkip`
 * @returns The document, ready for `JSON.stringify`
 * @example
 * ```ts
 * import { toOpenAPI } from "@noverax/courier/openapi"
 *
 * const document = toOpenAPI(api, { info: { title: "Billing", version: "2.4.0" } })
 * await writeFile("openapi.json", JSON.stringify(document, null, 2))
 * ```
 */
export function toOpenAPI(api: object, options: OpenAPIOptions = {}): OpenAPIDocument {
  const version = options.openapi ?? "3.1.0";
  const own = optionsOf(api);
  const components: ComponentSchemas = new Map();
  const security = securityOf(own?.session);
  const paths: OpenAPIDocument["paths"] = {};
  const groups = new Set<string>();
  for (const endpoint of eachEndpoint(api)) {
    const built = operationOf(endpoint, {
      version,
      components,
      security,
      fallback: options.jsonSchema,
    });
    if (built.skipped !== undefined) {
      options.onSkip?.({ operation: endpoint.id, reason: built.skipped });
      continue;
    }
    const item = paths[built.path] ?? {};
    paths[built.path] = item;
    if (item[built.method] !== undefined) {
      const taken = item[built.method]?.operationId;
      options.onSkip?.({ operation: endpoint.id, reason: `${taken} has the same method and path` });
      continue;
    }
    item[built.method] = built.operation;
    for (const tag of built.operation.tags ?? [])
      for (const name of withParents(tag)) groups.add(name);
  }
  const servers = options.servers ?? (own?.baseURL ? [{ url: own.baseURL }] : undefined);
  return {
    openapi: version,
    info: infoOf(api, options),
    ...(servers && servers.length > 0 && { servers: [...servers] }),
    ...(groups.size > 0 && { tags: tagsOf(groups, version) }),
    paths,
    ...componentsOf(components, security?.schemes),
  };
}

function optionsOf(api: object): BaseOptions | undefined {
  const options: unknown = Reflect.get(api, "options");
  return typeof options === "object" && options !== null ? (options as BaseOptions) : undefined;
}

function infoOf(api: object, options: OpenAPIOptions): OpenAPIDocument["info"] {
  const { title, version, description } = options.info ?? {};
  return {
    title: title ?? getSourceName(api) ?? "API",
    version: version ?? "0.0.0",
    ...(description !== undefined && { description }),
  };
}

/* `billing.invoices` → `billing`, `billing.invoices`: a nested group's parents are tags too. */
function withParents(tag: string): string[] {
  const names = tag.split(".");
  return names.map((_, at) => names.slice(0, at + 1).join("."));
}

/* A nested group's tag names its parent in 3.2, which has a place for it. */
function tagsOf(
  groups: ReadonlySet<string>,
  version: string,
): Array<{ name: string; parent?: string }> {
  return [...groups].map((name) => {
    const at = name.lastIndexOf(".");
    const parent = at > 0 ? name.slice(0, at) : undefined;
    return version === "3.2.0" && parent !== undefined && groups.has(parent)
      ? { name, parent }
      : { name };
  });
}

function componentsOf(
  schemas: ComponentSchemas,
  securitySchemes: Record<string, JSONSchema> | undefined,
): Pick<OpenAPIDocument, "components"> {
  const hasSchemas = schemas.size > 0;
  const hasSecurity = securitySchemes !== undefined && Object.keys(securitySchemes).length > 0;
  if (!hasSchemas && !hasSecurity) return {};
  return {
    components: {
      ...(hasSchemas && { schemas: Object.fromEntries(schemas) }),
      ...(hasSecurity && { securitySchemes }),
    },
  };
}
