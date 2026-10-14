import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { routesOf } from "@noverax/courier/internal";
import { describe, expect, it } from "vitest";
import { createProxyQueryKeys } from "../src/keys";

const { endpoint } = courier();

const testApi = defineApi({
  baseURL: "https://api.example.com",
  groups: {
    users: defineGroup({
      prefix: "users",
      endpoints: {
        getAll: endpoint.get("").response<unknown[]>(),
        getById: endpoint.get(":id").variables<{ id: number }>().response<unknown>(),
      },
    }),
    posts: defineGroup({
      prefix: "posts",
      endpoints: { list: endpoint.get("").response<unknown[]>() },
    }),
  },
});

describe("createProxyQueryKeys", () => {
  it("returns a function", () => {
    const key = createProxyQueryKeys(routesOf(testApi, "api"));
    expect(typeof key).toBe("function");
  });

  describe("group-level keys", () => {
    it("creates key with source and group", () => {
      const key = createProxyQueryKeys(routesOf(testApi, "api"));
      expect(key("users")).toEqual(["api", "users"]);
    });

    it("uses the provided source name", () => {
      const key = createProxyQueryKeys(routesOf(testApi, "backend"));
      expect(key("users")).toEqual(["backend", "users"]);
    });

    it("works with different groups", () => {
      const key = createProxyQueryKeys(routesOf(testApi, "api"));
      expect(key("posts")).toEqual(["api", "posts"]);
    });
  });

  describe("method-level keys", () => {
    it("creates key with source, group, and method", () => {
      const key = createProxyQueryKeys(routesOf(testApi, "api"));
      expect(key("users", "getAll")).toEqual(["api", "users", "getAll"]);
    });

    it("creates key for different methods", () => {
      const key = createProxyQueryKeys(routesOf(testApi, "api"));
      expect(key("users", "getById")).toEqual(["api", "users", "getById"]);
    });
  });

  describe("keys with variables", () => {
    it("appends variables as fourth element", () => {
      const key = createProxyQueryKeys(routesOf(testApi, "api"));
      expect(key("users", "getById", { id: 1 })).toEqual(["api", "users", "getById", { id: 1 }]);
    });

    it("handles complex variable objects", () => {
      const key = createProxyQueryKeys(routesOf(testApi, "api"));
      const vars = { page: 1, filter: "active", sort: "name" };
      expect(key("users", "getAll", vars)).toEqual(["api", "users", "getAll", vars]);
    });
  });

  describe("key structure", () => {
    it("group key has length 2", () => {
      const key = createProxyQueryKeys(routesOf(testApi, "api"));
      expect(key("users")).toHaveLength(2);
    });

    it("method key has length 3", () => {
      const key = createProxyQueryKeys(routesOf(testApi, "api"));
      expect(key("users", "getAll")).toHaveLength(3);
    });

    it("variable key has length 4", () => {
      const key = createProxyQueryKeys(routesOf(testApi, "api"));
      expect(key("users", "getById", { id: 1 })).toHaveLength(4);
    });

    it("group key is a prefix of method key", () => {
      const key = createProxyQueryKeys(routesOf(testApi, "api"));
      const groupKey = key("users");
      const methodKey = key("users", "getAll");

      expect(methodKey[0]).toBe(groupKey[0]);
      expect(methodKey[1]).toBe(groupKey[1]);
    });
  });
});
