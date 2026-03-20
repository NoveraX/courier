import type { Hono, Context as HonoContext } from "hono";

/** Mapping from URL path prefix to group name + endpoint resolver */
export interface PrefixMapping {
  /** Group prefix (e.g. "/products") */
  prefix: string;
  /** Group name (e.g. "products") */
  group: string;
  /** Endpoint names in this group */
  methods: string[];
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
 * E.g. `GET /products` → `products.getAll`
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

    // GET /prefix → getAll or getByX
    app.get(`/${prefix}`, (c) => {
      const variables = parseQueryParams(new URL(c.req.url).searchParams);
      const method = resolveGetMethod(mapping.methods, variables);
      return config.handleRequest(c, mapping.group, method, variables);
    });

    // GET /prefix/:id → getById
    app.get(`/${prefix}/:id`, (c) => {
      const id = parseId(c.req.param("id") ?? "");
      return config.handleRequest(c, mapping.group, "getById", { id });
    });

    // POST /prefix → create
    app.post(`/${prefix}`, async (c) => {
      const body = await c.req.json().catch(() => ({}));
      return config.handleRequest(c, mapping.group, "create", body);
    });

    // PUT /prefix/:id → update
    app.put(`/${prefix}/:id`, async (c) => {
      const id = parseId(c.req.param("id") ?? "");
      const body = await c.req.json().catch(() => ({}));
      return config.handleRequest(c, mapping.group, "update", { ...(body as object), id });
    });

    // PATCH /prefix/:id → patch / updateStatus
    app.patch(`/${prefix}/:id`, async (c) => {
      const id = parseId(c.req.param("id") ?? "");
      const body = await c.req.json().catch(() => ({}));
      const method = mapping.methods.includes("patch") ? "patch" : "updateStatus";
      return config.handleRequest(c, mapping.group, method, { ...(body as object), id });
    });

    // DELETE /prefix/:id → delete
    app.delete(`/${prefix}/:id`, async (c) => {
      const id = parseId(c.req.param("id") ?? "");
      return config.handleRequest(c, mapping.group, "delete", { id });
    });
  }
}

/** Resolve GET method: if variables have known filter keys, use specific method */
function resolveGetMethod(methods: string[], variables: Record<string, unknown>): string {
  for (const [key] of Object.entries(variables)) {
    const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
    // Try exact: productId → getByProductId
    const exact = `getBy${capitalized}`;
    if (methods.includes(exact)) return exact;
    // Try without Id suffix: productId → getByProduct
    const withoutId = exact.replace(/Id$/, "");
    if (withoutId !== exact && methods.includes(withoutId)) return withoutId;
    // Try without key suffix: userId → getByUser
    const stripped = `getBy${capitalized.replace(/Id$/, "")}`;
    if (stripped !== exact && methods.includes(stripped)) return stripped;
  }
  return "getAll";
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
