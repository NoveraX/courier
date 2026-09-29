import { describe, expect, it } from "vitest";
import { createMockRegistry } from "../src/registry";
import type { ResolvedHandler } from "../src/types";

function makeHandler(overrides?: Partial<ResolvedHandler>): ResolvedHandler {
  return {
    fn: () => "default",
    status: 200,
    isError: false,
    ...overrides,
  };
}

describe("MockRegistry", () => {
  it("stores and retrieves handlers", () => {
    const registry = createMockRegistry();
    const handler = makeHandler();
    registry.set("users", "getAll", handler);

    expect(registry.has("users", "getAll")).toBe(true);
    expect(registry.get("users", "getAll", "Started")).toBe(handler);
  });

  it("returns undefined for unregistered endpoints", () => {
    const registry = createMockRegistry();
    expect(registry.get("users", "getAll", "Started")).toBeUndefined();
    expect(registry.has("users", "getAll")).toBe(false);
  });

  it("uses LIFO stack — latest handler wins", () => {
    const registry = createMockRegistry();
    registry.set("users", "getAll", makeHandler({ fn: () => "first" }));
    registry.set("users", "getAll", makeHandler({ fn: () => "second" }));

    const resolved = registry.get("users", "getAll", "Started");
    expect(resolved?.fn({} as never)).toBe("second");
  });

  it("consumes handlers with remaining count", () => {
    const registry = createMockRegistry();
    registry.set("users", "getAll", makeHandler({ fn: () => "permanent" }));
    registry.set("users", "getAll", makeHandler({ fn: () => "once", remaining: 1 }));

    expect(registry.get("users", "getAll", "Started")?.fn({} as never)).toBe("once");
    expect(registry.get("users", "getAll", "Started")?.fn({} as never)).toBe("permanent");
  });

  it("filters by requiredState", () => {
    const registry = createMockRegistry();
    registry.set("users", "getAll", makeHandler({ fn: () => "default" }));
    registry.set(
      "users",
      "getAll",
      makeHandler({ fn: () => "authed", requiredState: "authenticated" }),
    );

    expect(registry.get("users", "getAll", "Started")?.fn({} as never)).toBe("default");
    expect(registry.get("users", "getAll", "authenticated")?.fn({} as never)).toBe("authed");
  });

  it("clears all handlers", () => {
    const registry = createMockRegistry();
    registry.set("users", "getAll", makeHandler());
    registry.set("posts", "getAll", makeHandler());
    registry.clear();

    expect(registry.has("users", "getAll")).toBe(false);
    expect(registry.has("posts", "getAll")).toBe(false);
  });

  it("removes handlers for a specific endpoint", () => {
    const registry = createMockRegistry();
    registry.set("users", "getAll", makeHandler());
    registry.set("posts", "getAll", makeHandler());
    registry.remove("users", "getAll");

    expect(registry.has("users", "getAll")).toBe(false);
    expect(registry.has("posts", "getAll")).toBe(true);
  });

  it("lists all registered endpoints", () => {
    const registry = createMockRegistry();
    registry.set("users", "getAll", makeHandler());
    registry.set("users", "getAll", makeHandler());
    registry.set("posts", "create", makeHandler());

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list).toContainEqual({ group: "users", method: "getAll", count: 2 });
    expect(list).toContainEqual({ group: "posts", method: "create", count: 1 });
  });
});
