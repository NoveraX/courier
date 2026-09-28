import { describe, expect, it } from "vitest";

import { createCollection } from "../../src/store/collection";

describe("ids a collection generates", () => {
  it("gives a record the next number when every id is a number", () => {
    const col = createCollection<{ id?: number | string; name: string }>();
    col.seed([
      { id: 3, name: "Ada" },
      { id: 9, name: "Grace" },
    ]);

    expect(col.create({ name: "Linus" }).id).toBe(10);
  });

  it("uses an id field of another name the same way", () => {
    const col = createCollection<{ petId?: number | string; name: string }>({ idField: "petId" });
    col.seed([{ petId: 4, name: "Rex" }]);

    expect(col.create({ name: "Tom" }).petId).toBe(5);
  });

  it("generates a string id when the ids are not all numbers", () => {
    const col = createCollection<{ id?: number | string; name: string }>();
    col.seed([
      { id: 1, name: "Ada" },
      { id: "x", name: "Grace" },
    ]);

    expect(col.create({ name: "Linus" }).id).toBe("auto-1");
  });

  it("generates a string id in an empty collection, whose id type is unknown", () => {
    const col = createCollection<{ id?: number | string; name: string }>();

    expect(col.create({ name: "Ada" }).id).toBe("auto-1");
  });
});
