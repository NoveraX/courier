import type { Hono, Context as HonoContext } from "hono";

/** CRUD operation type for an endpoint */
export type EndpointOperation =
  | "list"
  | "get"
  | "create"
  | "update"
  | "replace"
  | "upsert"
  | "delete"
  | "deleteAll"
  | "custom";

/** Endpoint metadata within a prefix mapping */
export interface MappedEndpoint {
  name: string;
  operation: EndpointOperation;
  /** Relative path within the group (e.g. "", ":petId", "browse", "categories") */
  path: string;
  /** HTTP method for this endpoint (e.g. "GET", "POST") */
  httpMethod?: string;
}

/** Mapping from URL path prefix to group name + endpoint resolver */
export interface PrefixMapping {
  /** Group prefix (e.g. "/products") */
  prefix: string;
  /** Group name (e.g. "products") */
  group: string;
  /** Endpoint names in this group */
  methods: string[];
  /** Analyzed endpoints with operation + path info */
  endpoints?: MappedEndpoint[];
}

/** Route config needed by prefix routes */
interface PrefixRouteConfig {
  handleRequest: (
    c: HonoContext,
    group: string,
    method: string,
    variables: unknown,
  ) => Promise<Response>;
}

/**
 * Register catch-all routes that map real HTTP paths to mock endpoints.
 *
 * Static sub-path endpoints (e.g. "browse", "categories") are registered
 * BEFORE the `/:id` catch-all so Hono matches them first.
 *
 * E.g. `GET /products` → `products.getAll`
 *      `GET /products/browse` → `products.browsePets`
 *      `GET /products/5` → `products.getById` with { id: "5" }
 *      `POST /products` → `products.create`
 */
export function registerPrefixRoutes(
  app: Hono,
  mappings: PrefixMapping[],
  config: PrefixRouteConfig,
): void {
  for (const mapping of mappings) {
    const prefix = mapping.prefix.replace(/^\//, "");
    const eps = mapping.endpoints;

    // GET /prefix → list endpoint
    app.get(`/${prefix}`, (c) => {
      const variables = parseQueryParams(new URL(c.req.url).searchParams);
      const hasParams = Object.keys(variables).length > 0;
      const method = hasParams
        ? resolveGetMethod(mapping.methods, variables)
        : (resolveByOperation(eps, "list")?.name ?? resolveGetMethod(mapping.methods, variables));
      return config.handleRequest(c, mapping.group, method, variables);
    });

    // Static sub-path endpoints MUST be registered before /:id to avoid being shadowed.
    // These are endpoints with a fixed path segment (e.g. "browse", "categories") that
    // would otherwise be mistaken for /:id = "browse".
    registerStaticSubPaths(app, prefix, eps ?? [], mapping.group, config);

    // GET /prefix/:id → get-by-id endpoint
    app.get(`/${prefix}/:id`, (c) => {
      const id = parseId(c.req.param("id") ?? "");
      const ep = resolveByOperation(eps, "get");
      const method =
        ep?.name ??
        resolveMethod(mapping.methods, ["getById", "findById", "findOne"], /^(get|find)/);
      return config.handleRequest(c, mapping.group, method, buildIdVars(ep, id));
    });

    // POST /prefix → create endpoint
    app.post(`/${prefix}`, async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const ep = resolveByOperation(eps, "create");
      const method =
        ep?.name ??
        resolveMethod(mapping.methods, ["create", "add", "insert"], /^(create|add|insert)/);
      return config.handleRequest(c, mapping.group, method, body);
    });

    // PUT /prefix/:id → replace/upsert endpoint
    app.put(`/${prefix}/:id`, async (c) => {
      const id = parseId(c.req.param("id") ?? "");
      const body = await c.req.json().catch(() => ({}));
      const ep = resolveByOperation(eps, "replace");
      const method =
        ep?.name ??
        resolveMethod(mapping.methods, ["update", "replace", "put"], /^(update|replace|put)/);
      return config.handleRequest(c, mapping.group, method, {
        ...(body as object),
        ...buildIdVars(ep, id),
      });
    });

    // PATCH /prefix/:id → update endpoint
    app.patch(`/${prefix}/:id`, async (c) => {
      const id = parseId(c.req.param("id") ?? "");
      const body = await c.req.json().catch(() => ({}));
      const ep = resolveByOperation(eps, "update");
      const method =
        ep?.name ??
        resolveMethod(mapping.methods, ["patch", "update", "updateStatus"], /^(patch|update|edit)/);
      return config.handleRequest(c, mapping.group, method, {
        ...(body as object),
        ...buildIdVars(ep, id),
      });
    });

    // DELETE /prefix → deleteAll endpoint
    app.delete(`/${prefix}`, (c) => {
      const ep = resolveByOperation(eps, "deleteAll");
      const method =
        ep?.name ??
        resolveMethod(
          mapping.methods,
          ["deleteAll", "removeAll", "clear"],
          /^(deleteAll|removeAll|clear)/,
        );
      return config.handleRequest(c, mapping.group, method, {});
    });

    // DELETE /prefix/:id → delete endpoint
    app.delete(`/${prefix}/:id`, async (c) => {
      const id = parseId(c.req.param("id") ?? "");
      const ep = resolveByOperation(eps, "delete");
      const method =
        ep?.name ?? resolveMethod(mapping.methods, ["delete", "remove"], /^(delete|remove)/);
      return config.handleRequest(c, mapping.group, method, buildIdVars(ep, id));
    });
  }
}

/**
 * Register explicit routes for endpoints that have a fixed sub-path (not a param).
 * E.g. `GET /adoptions/browse` for an endpoint with path="browse".
 *
 * Must be called before registering `/:id` to prevent the catch-all from matching first.
 */
function registerStaticSubPaths(
  app: Hono,
  prefix: string,
  endpoints: MappedEndpoint[],
  group: string,
  config: PrefixRouteConfig,
): void {
  for (const ep of endpoints) {
    if (!ep.path || ep.path.startsWith(":")) continue;

    const httpMethod = (ep.httpMethod ?? "GET").toUpperCase();
    const routePath = `/${prefix}/${ep.path}`;

    if (httpMethod === "GET") {
      app.get(routePath, (c) => {
        const variables = parseQueryParams(new URL(c.req.url).searchParams);
        return config.handleRequest(c, group, ep.name, variables);
      });
    } else if (httpMethod === "POST") {
      app.post(routePath, async (c) => {
        const body = await c.req.json().catch(() => ({}));
        return config.handleRequest(c, group, ep.name, body);
      });
    } else if (httpMethod === "PUT") {
      app.put(routePath, async (c) => {
        const body = await c.req.json().catch(() => ({}));
        return config.handleRequest(c, group, ep.name, body);
      });
    } else if (httpMethod === "PATCH") {
      app.patch(routePath, async (c) => {
        const body = await c.req.json().catch(() => ({}));
        return config.handleRequest(c, group, ep.name, body);
      });
    } else if (httpMethod === "DELETE") {
      app.delete(routePath, (c) => config.handleRequest(c, group, ep.name, {}));
    }
  }
}

/** Resolve endpoint by analyzed operation type — the source of truth */
function resolveByOperation(
  endpoints: MappedEndpoint[] | undefined,
  operation: EndpointOperation,
): MappedEndpoint | undefined {
  if (!endpoints) return undefined;
  return (
    endpoints.find((e) => e.operation === operation && !e.path) ??
    endpoints.find((e) => e.operation === operation)
  );
}

/** Build variables with the correct param name from endpoint path (e.g. ":petId" → { petId: val }) */
function buildIdVars(ep: MappedEndpoint | undefined, id: string | number): Record<string, unknown> {
  if (!ep?.path) return { id };
  const match = ep.path.match(/^:(\w+)/);
  const paramName = match?.[1];
  return paramName ? { [paramName]: id, id } : { id };
}

/** Resolve GET method: if variables have known filter keys, use specific method */
function resolveGetMethod(methods: string[], variables: Record<string, unknown>): string {
  for (const [key] of Object.entries(variables)) {
    const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
    const exact = `getBy${capitalized}`;
    if (methods.includes(exact)) return exact;
    const withoutId = exact.replace(/Id$/, "");
    if (withoutId !== exact && methods.includes(withoutId)) return withoutId;
    const stripped = `getBy${capitalized.replace(/Id$/, "")}`;
    if (stripped !== exact && methods.includes(stripped)) return stripped;
  }
  const listMethod = methods.find((m) => /^(list|getAll|findAll|findMany)/.test(m));
  return listMethod ?? "getAll";
}

/** Resolve method name: try exact matches first, then regex pattern on available methods */
function resolveMethod(methods: string[], exact: string[], pattern: RegExp): string {
  for (const name of exact) {
    if (methods.includes(name)) return name;
  }
  const match = methods.find((m) => pattern.test(m));
  return match ?? exact[0] ?? "unknown";
}

/** Parse ID — return number if numeric, string otherwise */
function parseId(raw: string): string | number {
  const num = Number(raw);
  return Number.isNaN(num) ? raw : num;
}

/** Parse query params, auto-coercing numeric strings to numbers */
function parseQueryParams(params: URLSearchParams): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of params) {
    const num = Number(value);
    result[key] = Number.isNaN(num) ? value : num;
  }
  return result;
}
