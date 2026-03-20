import { describe, expect, it } from "vitest";
import { defineFactory } from "../src/factory";

interface User {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

const userFactory = defineFactory<User>({
  defaults: { id: "1", name: "Alice", role: "user", active: true },
  traits: {
    admin: { role: "admin" },
    inactive: (base) => ({ ...base, active: false }),
  },
});

describe("defineFactory", () => {
  it("builds with defaults", () => {
    const user = userFactory.build();
    expect(user).toEqual({ id: "1", name: "Alice", role: "user", active: true });
  });

  it("applies overrides", () => {
    const user = userFactory.build({ name: "Bob" });
    expect(user.name).toBe("Bob");
    expect(user.role).toBe("user");
  });

  it("applies named traits", () => {
    const admin = userFactory.buildWith("admin");
    expect(admin.role).toBe("admin");
    expect(admin.name).toBe("Alice");
  });

  it("applies function traits", () => {
    const inactive = userFactory.buildWith("inactive");
    expect(inactive.active).toBe(false);
  });

  it("combines traits with overrides", () => {
    const admin = userFactory.buildWith("admin", { name: "Bob" });
    expect(admin.role).toBe("admin");
    expect(admin.name).toBe("Bob");
  });

  it("throws for unknown traits", () => {
    expect(() => userFactory.buildWith("nonexistent")).toThrow("Unknown trait");
  });

  it("builds a list", () => {
    const users = userFactory.buildList(3);
    expect(users).toHaveLength(3);
    expect(users[0]).toEqual({ id: "1", name: "Alice", role: "user", active: true });
  });

  it("builds a sequence with index transform", () => {
    const users = userFactory.buildSequence(3, (i, base) => ({
      ...base,
      id: String(i + 1),
      name: `User ${i + 1}`,
    }));
    expect(users).toHaveLength(3);
    expect(users[0]?.name).toBe("User 1");
    expect(users[2]?.id).toBe("3");
  });

  it("returns independent instances (no shared references)", () => {
    const a = userFactory.build();
    const b = userFactory.build();
    a.name = "Modified";
    expect(b.name).toBe("Alice");
  });

  it("supports defaults as function", () => {
    let counter = 0;
    const factory = defineFactory<{ id: number }>({
      defaults: () => ({ id: ++counter }),
    });

    expect(factory.build().id).toBe(1);
    expect(factory.build().id).toBe(2);
  });
});
