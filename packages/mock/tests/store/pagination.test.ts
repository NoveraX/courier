import { describe, expect, it } from "vitest";

import { createCollection } from "../../src/store/collection";

function numbered() {
  const col = createCollection<{ id: number; name: string }>();
  col.seed([
    { id: 1, name: "Ada" },
    { id: 2, name: "Grace" },
    { id: 3, name: "Linus" },
  ]);
  return col;
}

describe("cursor pagination", () => {
  it("starts after the cursor record when the cursor's id is the same id as a string", () => {
    const cursorFromRequest = JSON.parse('{ "id": "1" }');

    const page = numbered().findMany(null, { cursor: cursorFromRequest, take: 1 });

    expect(page.data.map((user) => user.name)).toEqual(["Grace"]);
  });

  it("starts after the cursor record named with the id's own type", () => {
    const page = numbered().findMany(null, { cursor: { id: 2, name: "Grace" }, take: 5 });

    expect(page.data.map((user) => user.name)).toEqual(["Linus"]);
  });
});
