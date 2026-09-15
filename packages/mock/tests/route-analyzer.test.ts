import { describe, expect, it } from "vitest";
import { defineApi, defineGroup, endpoint } from "@noverax/courier/define";
import { z } from "zod";

import { analyzeRoutes, getSourceGroupNames } from "../src/auto/route-analyzer";
import type { CrudOperation, RouteInfo } from "../src/auto/route-analyzer";

// ── Helpers ──────────────────────────────────────────────────────────────────

function findRoute(routes: RouteInfo[], group: string, ep: string): RouteInfo {
  const found = routes.find((r) => r.group === group && r.endpoint === ep);
  if (!found) throw new Error(`Route not found: ${group}.${ep}`);
  return found;
}

// ── Source definitions ───────────────────────────────────────────────────────

const UserSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });

const api = defineApi({
  baseURL: "https://test.api",
  groups: {
    users: defineGroup({
      prefix: "/users",
      endpoints: {
        getAll: endpoint<z.infer<typeof UserSchema>[]>({
          response: z.array(UserSchema),
          type: "query",
        })((http) => http.get("")),
        getById: endpoint<z.infer<typeof UserSchema>, { id: string }>({
          response: UserSchema,
          type: "query",
        })((http, vars) => http.get(":id", vars)),
        create: endpoint({ type: "mutation" })((http, vars) => http.post("", vars)),
        update: endpoint({ type: "mutation" })((http, vars) => http.patch(":id", vars)),
        replace: endpoint({ type: "mutation" })((http, vars) => http.put(":id", vars)),
        remove: endpoint({ type: "mutation" })((http, vars) => http.del(":id", vars)),
        removeAll: endpoint({ type: "mutation" })((http) => http.del("")),
      },
    }),
    products: defineGroup({
      prefix: "/products",
      endpoints: {
        list: endpoint({ type: "query" })((http) => http.get("")),
        browse: endpoint({ type: "query" })((http) => http.get("browse")),
        upload: endpoint({ type: "mutation" })((http, vars) => http.post("import", vars)),
        upsert: endpoint({ type: "mutation" })((http, vars) => http.put("", vars)),
      },
    }),
  },
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("analyzeRoutes", () => {
  const routes = analyzeRoutes(api);

  describe("grouped endpoints — CRUD detection", () => {
    it("detects GET / as list operation", () => {
      const r = findRoute(routes, "users", "getAll");
      expect(r.httpMethod).toBe("GET");
      expect(r.operation).toBe("list");
      expect(r.hasIdParam).toBe(false);
      expect(r.fullPath).toBe("/users");
    });

    it("detects GET /:id as get operation", () => {
      const r = findRoute(routes, "users", "getById");
      expect(r.httpMethod).toBe("GET");
      expect(r.operation).toBe("get");
      expect(r.hasIdParam).toBe(true);
      expect(r.fullPath).toBe("/users/:id");
    });

    it("detects POST / as create operation", () => {
      const r = findRoute(routes, "users", "create");
      expect(r.httpMethod).toBe("POST");
      expect(r.operation).toBe("create");
    });

    it("detects PATCH /:id as update operation", () => {
      const r = findRoute(routes, "users", "update");
      expect(r.httpMethod).toBe("PATCH");
      expect(r.operation).toBe("update");
      expect(r.hasIdParam).toBe(true);
    });

    it("detects PUT /:id as replace operation", () => {
      const r = findRoute(routes, "users", "replace");
      expect(r.httpMethod).toBe("PUT");
      expect(r.operation).toBe("replace");
    });

    it("detects DELETE /:id as delete operation", () => {
      const r = findRoute(routes, "users", "remove");
      expect(r.httpMethod).toBe("DELETE");
      expect(r.operation).toBe("delete");
    });

    it("detects DELETE / as deleteAll operation", () => {
      const r = findRoute(routes, "users", "removeAll");
      expect(r.httpMethod).toBe("DELETE");
      expect(r.operation).toBe("deleteAll");
    });
  });

  describe("static sub-paths → custom operation", () => {
    it("detects GET /browse as custom, not list", () => {
      const r = findRoute(routes, "products", "browse");
      expect(r.httpMethod).toBe("GET");
      expect(r.operation).toBe("custom");
      expect(r.path).toBe("browse");
    });

    it("detects POST /import as custom, not create", () => {
      const r = findRoute(routes, "products", "upload");
      expect(r.httpMethod).toBe("POST");
      expect(r.operation).toBe("custom");
    });
  });

  describe("PUT without :id → upsert", () => {
    it("detects PUT / as upsert operation", () => {
      const r = findRoute(routes, "products", "upsert");
      expect(r.httpMethod).toBe("PUT");
      expect(r.operation).toBe("upsert");
      expect(r.hasIdParam).toBe(false);
    });
  });

  describe("path normalization", () => {
    it("sets correct fullPath with prefix", () => {
      const r = findRoute(routes, "products", "list");
      expect(r.fullPath).toBe("/products");
    });

    it("builds fullPath with sub-path", () => {
      const r = findRoute(routes, "products", "browse");
      expect(r.fullPath).toBe("/products/browse");
    });
  });

  it("returns all endpoints from all groups", () => {
    const userRoutes = routes.filter((r) => r.group === "users");
    const productRoutes = routes.filter((r) => r.group === "products");
    expect(userRoutes).toHaveLength(7);
    expect(productRoutes).toHaveLength(4);
  });

  it("skips non-function entries and options", () => {
    expect(routes.find((r) => r.endpoint === "options")).toBeUndefined();
  });
});

describe("analyzeRoutes — default prefix from group name", () => {
  const apiNoPrefix = defineApi({
    baseURL: "http://localhost",
    groups: {
      status: defineGroup({
        endpoints: {
          ping: endpoint({ type: "query" })((http) => http.get("")),
        },
      }),
    },
  });

  it("uses /groupName when no prefix is specified", () => {
    const routes = analyzeRoutes(apiNoPrefix);
    const r = findRoute(routes, "status", "ping");
    expect(r.fullPath).toBe("/status");
  });
});

describe("analyzeRoutes — schema metadata", () => {
  it("preserves response schema when provided", () => {
    const routes = analyzeRoutes(api);
    const r = findRoute(routes, "users", "getAll");
    expect(r.responseSchema).toBeDefined();
  });

  it("preserves endpoint type (query/mutation)", () => {
    const routes = analyzeRoutes(api);
    expect(findRoute(routes, "users", "getAll").type).toBe("query");
    expect(findRoute(routes, "users", "create").type).toBe("mutation");
  });
});

describe("analyzeRoutes — operation coverage", () => {
  const ops: CrudOperation[] = [
    "list", "get", "create", "update", "replace", "upsert", "delete", "deleteAll", "custom",
  ];

  it("all CrudOperation variants are valid", () => {
    expect(new Set(ops).size).toBe(9);
  });
});

describe("getSourceGroupNames", () => {
  it("returns group names from source", () => {
    const names = getSourceGroupNames(api);
    expect(names).toEqual(new Set(["users", "products"]));
  });

  it("returns empty set when no groups", () => {
    expect(getSourceGroupNames({ options: {} })).toEqual(new Set());
  });

  it("returns empty set when no options", () => {
    expect(getSourceGroupNames({})).toEqual(new Set());
  });
});
