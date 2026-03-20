import { describe, expect, it } from "vitest";
import { createMockStore } from "../src/store/mock-store";
import { defineRelations, resolveMany, resolveOne } from "../src/store/relations";

type User = {
  id: string;
  name: string;
  role: "user" | "admin";
  active: boolean;
};

type Post = {
  id: string;
  title: string;
  authorId: string;
};

describe("MockStore", () => {
  it("creates and retrieves a collection", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    expect(store.has("users")).toBe(true);
    expect(store.list()).toEqual(["users"]);

    // Same reference on repeated access
    expect(store.collection<User>("users")).toBe(users);
  });

  it("resets all collections", () => {
    const store = createMockStore();
    store.collection<User>("users").create({ id: "1", name: "Alice", role: "user", active: true });
    store.reset();
    expect(store.collection<User>("users").count()).toBe(0);
  });

  it("snapshots and restores state", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    users.create({ id: "1", name: "Alice", role: "user", active: true });

    const snap = store.snapshot();
    users.create({ id: "2", name: "Bob", role: "admin", active: true });
    expect(users.count()).toBe(2);

    store.restore(snap);
    expect(users.count()).toBe(1);
    expect(users.getById("1")?.name).toBe("Alice");
  });
});

describe("Collection CRUD", () => {
  it("creates records with auto-generated id", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    const user = users.create({ name: "Alice", role: "user", active: true });

    expect(user.id).toBeDefined();
    expect(user.name).toBe("Alice");
    expect(users.count()).toBe(1);
  });

  it("creates records with explicit id", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    const user = users.create({ id: "42", name: "Bob", role: "admin", active: true });
    expect(user.id).toBe("42");
  });

  it("createMany with factory function", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    users.createMany(3, (i) => ({
      id: String(i + 1),
      name: `User ${i + 1}`,
      role: "user",
      active: true,
    }));
    expect(users.count()).toBe(3);
    expect(users.getById("2")?.name).toBe("User 2");
  });

  it("seeds collection (replaces all records)", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    users.create({ id: "old", name: "Old", role: "user", active: true });
    users.seed([
      { id: "1", name: "New", role: "admin", active: true },
    ]);
    expect(users.count()).toBe(1);
    expect(users.getById("1")?.name).toBe("New");
  });

  it("updates first matching record with partial data", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    users.create({ id: "1", name: "Alice", role: "user", active: true });

    const updated = users.update(
      (q) => q.where({ id: "1" }),
      { data: { role: "admin" } },
    );
    expect(updated?.role).toBe("admin");
    expect(updated?.name).toBe("Alice"); // unchanged
  });

  it("updates with mutator function", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    users.create({ id: "1", name: "alice", role: "user", active: true });

    users.update(
      (q) => q.where({ id: "1" }),
      { data: (u) => { u.name = u.name.toUpperCase(); } },
    );
    expect(users.getById("1")?.name).toBe("ALICE");
  });

  it("updateMany affects all matching", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    users.createMany(3, (i) => ({
      id: String(i),
      name: `U${i}`,
      role: "user",
      active: false,
    }));

    const count = users.updateMany(
      (q) => q.where({ active: false }),
      { data: { active: true } },
    );
    expect(count).toBe(3);
    expect(users.getAll().every((u) => u.active)).toBe(true);
  });

  it("deletes first matching record", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    users.create({ id: "1", name: "Alice", role: "user", active: true });
    users.create({ id: "2", name: "Bob", role: "user", active: true });

    expect(users.delete((q) => q.where({ id: "1" }))).toBe(true);
    expect(users.count()).toBe(1);
    expect(users.getById("1")).toBeUndefined();
  });

  it("deleteMany removes all matching", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    users.createMany(5, (i) => ({
      id: String(i),
      name: `U${i}`,
      role: i < 2 ? "admin" : "user",
      active: true,
    }));

    const deleted = users.deleteMany((q) => q.where({ role: "user" }));
    expect(deleted).toBe(3);
    expect(users.count()).toBe(2);
  });
});

describe("Collection querying", () => {
  it("findFirst with where predicate", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    users.seed([
      { id: "1", name: "Alice", role: "admin", active: true },
      { id: "2", name: "Bob", role: "user", active: true },
    ]);

    const admin = users.findFirst((q) => q.where({ role: "admin" }));
    expect(admin?.name).toBe("Alice");
  });

  it("findFirst with predicate function", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    users.seed([
      { id: "1", name: "Alice", role: "user", active: true },
      { id: "2", name: "Andrew", role: "user", active: true },
      { id: "3", name: "Bob", role: "user", active: true },
    ]);

    const found = users.findFirst((q) => q.where({ name: (n) => n.startsWith("A") }));
    expect(found?.name).toBe("Alice");
  });

  it("findMany with or clause", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    users.seed([
      { id: "1", name: "Alice", role: "admin", active: true },
      { id: "2", name: "Bob", role: "user", active: false },
      { id: "3", name: "Charlie", role: "user", active: true },
    ]);

    const result = users.findMany((q) => q.where({ role: "admin" }).or({ active: false }));
    expect(result.data).toHaveLength(2);
  });

  it("findMany with sorting", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    users.seed([
      { id: "1", name: "Charlie", role: "user", active: true },
      { id: "2", name: "Alice", role: "user", active: true },
      { id: "3", name: "Bob", role: "user", active: true },
    ]);

    const result = users.findMany(null, { orderBy: { name: "asc" } });
    expect(result.data.map((u) => u.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("findMany with pagination", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    users.createMany(10, (i) => ({
      id: String(i),
      name: `User ${i}`,
      role: "user",
      active: true,
    }));

    const page1 = users.findMany(null, { take: 3, skip: 0 });
    expect(page1.data).toHaveLength(3);
    expect(page1.total).toBe(10);
    expect(page1.page).toBe(1);
    expect(page1.totalPages).toBe(4);

    const page2 = users.findMany(null, { take: 3, skip: 3 });
    expect(page2.data).toHaveLength(3);
    expect(page2.page).toBe(2);
  });

  it("findMany with cursor pagination", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    users.createMany(5, (i) => ({
      id: String(i),
      name: `User ${i}`,
      role: "user",
      active: true,
    }));

    const cursor = users.getById("2");
    const result = users.findMany(null, { cursor, take: 2 });
    expect(result.data).toHaveLength(2);
    expect(result.data[0]?.id).toBe("3");
    expect(result.data[1]?.id).toBe("4");
  });
});

describe("Relations", () => {
  it("resolves one-to-one relation", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    const posts = store.collection<Post>("posts");

    users.seed([{ id: "1", name: "Alice", role: "user", active: true }]);
    posts.seed([{ id: "p1", title: "Hello", authorId: "1" }]);

    const rels = defineRelations(posts, ({ one }) => ({
      author: one(users, { key: "authorId" }),
    }));

    const post = posts.getById("p1");
    expect(post).toBeDefined();
    const author = resolveOne(post!, rels["author"]!);
    expect(author?.name).toBe("Alice");
  });

  it("resolves one-to-many relation", () => {
    const store = createMockStore();
    const users = store.collection<User>("users");
    const posts = store.collection<Post>("posts");

    users.seed([{ id: "1", name: "Alice", role: "user", active: true }]);
    posts.seed([
      { id: "p1", title: "Post 1", authorId: "1" },
      { id: "p2", title: "Post 2", authorId: "1" },
      { id: "p3", title: "Post 3", authorId: "2" },
    ]);

    const rels = defineRelations(users, ({ many }) => ({
      posts: many(posts, { foreignKey: "authorId" }),
    }));

    const user = users.getById("1");
    const userPosts = resolveMany(user!, rels.posts as any);
    expect(userPosts).toHaveLength(2);
  });
});
