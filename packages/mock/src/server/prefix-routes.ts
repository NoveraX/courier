/**
 * Prefix-based REST route registration — public entry point.
 *
 * Registers catch-all routes that map real HTTP paths to mock endpoints
 * based on a list of `PrefixMapping` entries. Wires up CRUD routes;
 * supporting pieces live in siblings:
 *
 * - `prefix-route-types`  — `MappedEndpoint`, `PrefixMapping`, `PrefixRouteConfig`
 * - `route-helpers`       — pure resolvers (`resolveMethod`, `parseId`, ...)
 * - `prefix-static-routes` — SSE registration
 * - `declared-routes`     — routes for endpoints the catch-alls do not answer
 */

import type { Hono } from "hono";

import { registerDeclaredRoutes } from "./declared-routes";
import type { PrefixMapping, PrefixRouteConfig } from "./prefix-route-types";
import { registerSSERoutes } from "./prefix-static-routes";
import { readJsonBody } from "./read-json-body";
import {
  buildIdVars,
  parseId,
  parseQueryParams,
  resolveByOperation,
  resolveGetMethod,
  resolveMethod,
} from "./route-helpers";

/**
 * Register catch-all routes that map real HTTP paths to mock endpoints.
 *
 * Endpoints at any other path — fixed sub-paths ("browse"), lookups
 * ("by-email/:email"), nested paths (":id/orders") — are registered at
 * their declared path BEFORE the `/:id` catch-all so Hono matches them first.
 *
 * E.g. `GET /products` → `products.getAll`
 *      `GET /products/browse` → `products.browsePets`
 *      `GET /products/5/reviews` → `products.reviews` with { id: 5 }
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

    // SSE endpoints are registered as explicit GET routes at /{prefix}/{name}.
    // They MUST be registered before /:id to avoid being shadowed by the catch-all.
    registerSSERoutes(app, prefix, eps ?? [], mapping.group, config);

    // Endpoints the catch-alls below do not answer MUST be registered first:
    // a fixed sub-path ("browse") would otherwise be taken for /:id = "browse".
    registerDeclaredRoutes(app, prefix, eps ?? [], mapping.group, config);

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
      const read = await readJsonBody(c);
      if ("error" in read) return c.json({ error: read.error }, 400);
      const body = read.value ?? {};
      const ep = resolveByOperation(eps, "create");
      const method =
        ep?.name ??
        resolveMethod(mapping.methods, ["create", "add", "insert"], /^(create|add|insert)/);
      return config.handleRequest(c, mapping.group, method, body);
    });

    // PUT /prefix/:id → replace/upsert endpoint
    app.put(`/${prefix}/:id`, async (c) => {
      const id = parseId(c.req.param("id") ?? "");
      const read = await readJsonBody(c);
      if ("error" in read) return c.json({ error: read.error }, 400);
      const body = read.value ?? {};
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
      const read = await readJsonBody(c);
      if ("error" in read) return c.json({ error: read.error }, 400);
      const body = read.value ?? {};
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
