import { describe, expect, it } from "vitest";

import { inferRoutes } from "../src/auto/convention-router";
import type { RouteInfo } from "../src/auto/route-analyzer";

// ── Helpers ──────────────────────────────────────────────────────────────────

function infer(group: string, endpoint: string): RouteInfo {
  return inferRoutes([{ group, endpoint }])[0]!;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("inferRoutes", () => {
  describe("exact match — list endpoints", () => {
    it.each(["getAll", "list", "findAll", "findMany"])("%s → GET / (list)", (name) => {
      const r = infer("users", name);
      expect(r.httpMethod).toBe("GET");
      expect(r.path).toBe("");
      expect(r.operation).toBe("list");
      expect(r.fullPath).toBe("/users");
      expect(r.hasIdParam).toBe(false);
    });
  });

  describe("exact match — get by id", () => {
    it.each(["getById", "findById", "findOne"])("%s → GET /:id (get)", (name) => {
      const r = infer("products", name);
      expect(r.httpMethod).toBe("GET");
      expect(r.path).toBe(":id");
      expect(r.operation).toBe("get");
      expect(r.fullPath).toBe("/products/:id");
      expect(r.hasIdParam).toBe(true);
    });
  });

  describe("exact match — create", () => {
    it.each(["create", "add", "insert"])("%s → POST / (create)", (name) => {
      const r = infer("orders", name);
      expect(r.httpMethod).toBe("POST");
      expect(r.path).toBe("");
      expect(r.operation).toBe("create");
    });
  });

  describe("exact match — update", () => {
    it.each(["update", "patch", "edit"])("%s → PATCH /:id (update)", (name) => {
      const r = infer("items", name);
      expect(r.httpMethod).toBe("PATCH");
      expect(r.path).toBe(":id");
      expect(r.operation).toBe("update");
      expect(r.hasIdParam).toBe(true);
    });
  });

  it("updateStatus → PATCH /:id (update)", () => {
    const r = infer("orders", "updateStatus");
    expect(r.httpMethod).toBe("PATCH");
    expect(r.operation).toBe("update");
  });

  describe("exact match — replace", () => {
    it.each(["replace", "put"])("%s → PUT /:id (replace)", (name) => {
      const r = infer("products", name);
      expect(r.httpMethod).toBe("PUT");
      expect(r.path).toBe(":id");
      expect(r.operation).toBe("replace");
    });
  });

  it("upsert → PUT / (upsert)", () => {
    const r = infer("settings", "upsert");
    expect(r.httpMethod).toBe("PUT");
    expect(r.path).toBe("");
    expect(r.operation).toBe("upsert");
  });

  describe("exact match — delete", () => {
    it.each(["delete", "remove"])("%s → DELETE /:id (delete)", (name) => {
      const r = infer("users", name);
      expect(r.httpMethod).toBe("DELETE");
      expect(r.path).toBe(":id");
      expect(r.operation).toBe("delete");
    });
  });

  describe("exact match — deleteAll", () => {
    it.each(["deleteAll", "removeAll", "clear"])("%s → DELETE / (deleteAll)", (name) => {
      const r = infer("cache", name);
      expect(r.httpMethod).toBe("DELETE");
      expect(r.path).toBe("");
      expect(r.operation).toBe("deleteAll");
    });
  });

  describe("prefix pattern — getBy{Field}", () => {
    it.each(["getByEmail", "findByName", "fetchBySlug"])(
      "%s → GET / (list, query param style)",
      (name) => {
        const r = infer("users", name);
        expect(r.httpMethod).toBe("GET");
        expect(r.operation).toBe("list");
      },
    );
  });

  describe("prefix pattern — create/add/insert*", () => {
    it.each(["createBulk", "addItem", "insertMany"])("%s → POST / (create)", (name) => {
      const r = infer("items", name);
      expect(r.httpMethod).toBe("POST");
      expect(r.operation).toBe("create");
    });
  });

  describe("prefix pattern — update/patch/edit*", () => {
    it.each(["updateProfile", "patchSettings", "editBio"])("%s → PATCH /:id (update)", (name) => {
      const r = infer("users", name);
      expect(r.httpMethod).toBe("PATCH");
      expect(r.operation).toBe("update");
    });
  });

  describe("prefix pattern — delete/remove*", () => {
    it.each(["deleteExpired", "removeInactive"])("%s → DELETE /:id (delete)", (name) => {
      const r = infer("sessions", name);
      expect(r.httpMethod).toBe("DELETE");
      expect(r.operation).toBe("delete");
    });
  });

  describe("prefix pattern — get/find/search/query*", () => {
    it.each(["getRecent", "findActive", "searchByTerm", "queryFiltered", "listArchived", "fetchAll"])(
      "%s → GET / (list)",
      (name) => {
        const r = infer("items", name);
        expect(r.httpMethod).toBe("GET");
        expect(r.operation).toBe("list");
      },
    );
  });

  describe("fallback — unknown names", () => {
    it.each(["doSomething", "process", "sync", "validate"])(
      "%s → GET / (custom)",
      (name) => {
        const r = infer("misc", name);
        expect(r.httpMethod).toBe("GET");
        expect(r.operation).toBe("custom");
      },
    );
  });

  describe("fullPath construction", () => {
    it("builds correct fullPath without sub-path", () => {
      const r = infer("users", "getAll");
      expect(r.fullPath).toBe("/users");
    });

    it("builds correct fullPath with :id", () => {
      const r = infer("users", "getById");
      expect(r.fullPath).toBe("/users/:id");
    });
  });

  describe("multiple endpoints at once", () => {
    it("returns one route per input endpoint", () => {
      const routes = inferRoutes([
        { group: "users", endpoint: "getAll" },
        { group: "users", endpoint: "create" },
        { group: "products", endpoint: "delete" },
      ]);
      expect(routes).toHaveLength(3);
      expect(routes[0]!.group).toBe("users");
      expect(routes[1]!.operation).toBe("create");
      expect(routes[2]!.group).toBe("products");
    });
  });

  describe("group name becomes URL prefix", () => {
    it("uses group name as path segment", () => {
      const r = infer("orderItems", "getAll");
      expect(r.fullPath).toBe("/orderItems");
    });
  });
});
