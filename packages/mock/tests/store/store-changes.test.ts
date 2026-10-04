/**
 * What saving a store writes: nothing while nothing changed, and otherwise
 * only the rows of the records added, changed, moved or gone — a record a
 * handler edited in place included.
 */
import { describe, expect, it } from "vitest";

import { createMockStore, type MockStore } from "../../src/store";
import { storeChanges } from "../../src/store/store-changes";
import type { CollectionMirror } from "../../src/store/store-mirror";

/** A store with three users, saved once, and the mirrors of that save. */
function saved(): { store: MockStore; mirrors: Map<string, CollectionMirror> } {
  const store = createMockStore();
  const users = store.collection("users");
  for (const name of ["Ada", "Grace", "Linus"]) users.create({ name });
  const mirrors = new Map<string, CollectionMirror>();
  storeChanges(store, mirrors)?.settle();
  return { store, mirrors };
}

describe("storeChanges", () => {
  it("writes a new collection and every record in it, in order", () => {
    const store = createMockStore();
    store.collection("users").create({ id: 1, name: "Ada" });
    store.collection("posts");

    const save = storeChanges(store, new Map());

    expect(save?.changes).toEqual({
      added: ["users", "posts"],
      removed: [],
      upserts: [{ collection: "users", row: 1, position: 0, data: '{"id":1,"name":"Ada"}' }],
      deletes: [],
    });
  });

  it("writes nothing while the file holds the store", () => {
    const { store, mirrors } = saved();

    expect(storeChanges(store, mirrors)).toBeNull();
  });

  it("writes only the record edited, an edit made in place included", () => {
    const { store, mirrors } = saved();
    const [, grace] = store.collection("users").getAll();
    if (grace === undefined) throw new Error("no second user");

    grace.name = "Grace Hopper";

    expect(storeChanges(store, mirrors)?.changes).toEqual({
      added: [],
      removed: [],
      upserts: [
        { collection: "users", row: 2, position: 1, data: expect.stringContaining("Grace Hopper") },
      ],
      deletes: [],
    });
  });

  it("deletes only the record gone, and adds only the record created after the rest", () => {
    const { store, mirrors } = saved();
    const users = store.collection("users");
    users.delete((q) => q.where({ name: "Grace" }));
    users.create({ name: "Margaret" });

    expect(storeChanges(store, mirrors)?.changes).toEqual({
      added: [],
      removed: [],
      upserts: [
        { collection: "users", row: 4, position: 3, data: expect.stringContaining("Margaret") },
      ],
      deletes: [{ collection: "users", row: 2 }],
    });
  });

  it("gives every row its index once the records change order", () => {
    const { store, mirrors } = saved();
    const users = store.collection("users");
    users.seed([...users.getAll()].reverse());

    const upserts = storeChanges(store, mirrors)?.changes.upserts ?? [];

    expect(upserts.map(({ position, data }) => [position, JSON.parse(data).name])).toEqual([
      [0, "Linus"],
      [1, "Grace"],
      [2, "Ada"],
    ]);
  });

  it("removes a collection the store no longer holds", () => {
    const { mirrors } = saved();

    expect(storeChanges(createMockStore(), mirrors)?.changes.removed).toEqual(["users"]);
  });

  it("leaves the mirrors as they were until the save is settled", () => {
    const { store, mirrors } = saved();
    store.collection("users").create({ name: "Barbara" });

    const save = storeChanges(store, mirrors);
    expect(storeChanges(store, mirrors)?.changes.upserts).toHaveLength(1);

    save?.settle();
    expect(storeChanges(store, mirrors)).toBeNull();
  });

  it("is refused for a record that cannot be written as JSON", () => {
    const store = createMockStore();
    store.collection("users").create({ id: 1, balance: 10n });

    expect(() => storeChanges(store, new Map())).toThrow(TypeError);
  });
});
