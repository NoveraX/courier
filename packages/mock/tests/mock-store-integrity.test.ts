/**
 * The mock store keeping its records whole: snapshots that stay as taken,
 * restores that give back exactly the snapshot, ids that match whatever
 * their type, and generated ids that do not depend on other stores.
 */
import { describe, expect, it } from "vitest";

import { createMockStore } from "../src/store";
import { applyPagination } from "../src/store/pagination";

describe("snapshot and restore", () => {
  it("undoes an in-place update", () => {
    const store = createMockStore();
    const users = store.collection("users");
    users.create({ id: "1", name: "Alice" });
    const snap = store.snapshot();

    users.updateById("1", { name: "MUTATED" });
    store.restore(snap);

    expect(users.getById("1")).toEqual({ id: "1", name: "Alice" });
  });

  it("empties a collection the snapshot did not have", () => {
    const store = createMockStore();
    store.collection("users").create({ id: "u1" });
    const snap = store.snapshot();
    store.collection("orders").create({ id: "o1" });

    store.restore(snap);

    expect(store.collection("orders").count()).toBe(0);
  });

  it("restores into a store that never had the collections", () => {
    const source = createMockStore();
    source.collection("users").create({ id: "u1", name: "Alice" });
    const target = createMockStore();

    target.restore(source.snapshot());

    expect(target.collection("users").getById("u1")).toEqual({ id: "u1", name: "Alice" });
  });
});

describe("ids", () => {
  it("finds a record by id whether the id is asked for as a string or a number", () => {
    const store = createMockStore();
    const col = store.collection("things");
    col.seed([{ id: "1" }, { id: 2 }, { id: "007" }]);

    expect(col.getById(1)).toEqual({ id: "1" });
    expect(col.getById("2")).toEqual({ id: 2 });
    expect(col.getById("007")).toEqual({ id: "007" });
    expect(col.getById("7")).toBeUndefined();
  });

  it("starts generated ids over in each collection and after a reset", () => {
    const first = createMockStore().collection("a").create({});
    const store = createMockStore();
    store.collection("b").create({});
    store.reset();
    const afterReset = store.collection("b").create({});

    expect(first.id).toBe("auto-1");
    expect(afterReset.id).toBe("auto-1");
  });

  it("never generates an id a record already holds", () => {
    const col = createMockStore().collection("c");
    col.seed([{ id: "auto-1" }]);

    expect(col.create({}).id).toBe("auto-2");
  });

  it("uses the key a later collection() call asks for", () => {
    const store = createMockStore();
    store.collection("users", { idField: "id" });
    const users = store.collection("users", { idField: "_id" });

    users.seed([{ _id: "abc", name: "Alice" }]);

    expect(users.getById("abc")).toEqual({ _id: "abc", name: "Alice" });
    expect(users.create({ name: "Bob" })).not.toHaveProperty("id");
  });

  it("replaces a record wholesale, keeping its id", () => {
    const col = createMockStore().collection("todos");
    col.seed([{ id: 1, title: "Write", done: true }]);

    col.replace("1", { title: "Only title" });

    expect(col.getById(1)).toEqual({ id: 1, title: "Only title" });
  });
});

describe("pagination", () => {
  it("reports no pages for an empty set, whether or not take was given", () => {
    expect(applyPagination([], {}, "id")).toMatchObject({ page: 1, totalPages: 0 });
    expect(applyPagination([], { take: 10 }, "id")).toMatchObject({ page: 1, totalPages: 0 });
  });

  it("reports no pages when a page holds nothing", () => {
    const result = applyPagination([{ id: 1 }, { id: 2 }, { id: 3 }], { take: 0 }, "id");

    expect(result).toMatchObject({ data: [], total: 3, totalPages: 0 });
  });
});
