import { describe, expect, it } from "vitest";

import type { MockCollectionSnapshot, MockStoreReport } from "../src/events/mock";
import { applyStoreReport } from "../src/mock-store";

const users: MockCollectionSnapshot = {
  name: "users",
  count: 3,
  records: [{ id: 1 }, { id: 2 }, { id: 3 }],
};
const posts: MockCollectionSnapshot = { name: "posts", count: 1, records: [{ id: 7 }] };

function report(fields: Partial<MockStoreReport>): MockStoreReport {
  return { seq: 1, whole: false, collections: [], removed: [], ...fields };
}

describe("applyStoreReport", () => {
  it("removes, changes and adds records as a collection's edits say", () => {
    const next = applyStoreReport(
      [users],
      report({
        collections: [
          {
            name: "users",
            count: 3,
            edits: {
              removed: [0],
              changed: [{ index: 1, record: { id: 3, name: "Ada" } }],
              added: [{ id: 4 }],
            },
          },
        ],
      }),
    );

    expect(next).toEqual([
      { name: "users", count: 3, records: [{ id: 2 }, { id: 3, name: "Ada" }, { id: 4 }] },
    ]);
  });

  it("leaves the collections a report does not name as they were", () => {
    const next = applyStoreReport(
      [users, posts],
      report({ collections: [{ name: "posts", count: 0, records: [] }] }),
    );

    expect(next).toEqual([users, { name: "posts", count: 0, records: [] }]);
  });

  it("drops the collections a report names gone, and adds a new one after the rest", () => {
    const next = applyStoreReport(
      [users, posts],
      report({ collections: [{ name: "tags", count: 0, records: [] }], removed: ["users"] }),
    );

    expect(next?.map((collection) => collection.name)).toEqual(["posts", "tags"]);
  });

  it("keeps only the collections a whole report holds", () => {
    const next = applyStoreReport(
      [users, posts],
      report({ whole: true, collections: [{ name: "posts", count: 0, records: [] }] }),
    );

    expect(next).toEqual([{ name: "posts", count: 0, records: [] }]);
  });

  it("returns undefined when edits name a record the collection does not hold", () => {
    const edits = { removed: [3], changed: [], added: [] };

    expect(
      applyStoreReport([users], report({ collections: [{ name: "users", count: 2, edits }] })),
    ).toBeUndefined();
  });

  it("returns undefined when a change lands past the records that remain", () => {
    const edits = { removed: [0], changed: [{ index: 2, record: {} }], added: [] };

    expect(
      applyStoreReport([users], report({ collections: [{ name: "users", count: 2, edits }] })),
    ).toBeUndefined();
  });

  it("returns undefined when edits leave another count than the mock's", () => {
    const edits = { removed: [], changed: [], added: [{ id: 4 }] };

    expect(
      applyStoreReport([users], report({ collections: [{ name: "users", count: 5, edits }] })),
    ).toBeUndefined();
  });

  it("returns undefined for edits to a collection it does not hold", () => {
    const edits = { removed: [], changed: [], added: [{ id: 1 }] };

    expect(
      applyStoreReport([users], report({ collections: [{ name: "tags", count: 1, edits }] })),
    ).toBeUndefined();
  });

  it("leaves the collections it was given untouched", () => {
    const held = structuredClone(users);
    const edits = { removed: [0], changed: [], added: [{ id: 9 }] };

    applyStoreReport([held], report({ collections: [{ name: "users", count: 3, edits }] }));

    expect(held).toEqual(users);
  });

  it("adds tens of thousands of records at once", () => {
    const added = Array.from({ length: 200_000 }, (_, id) => ({ id }));
    const edits = { removed: [], changed: [], added };
    const empty = { name: "users", count: 0, records: [] };

    const next = applyStoreReport(
      [empty],
      report({ collections: [{ name: "users", count: 200_000, edits }] }),
    );

    expect(next?.[0]?.records).toHaveLength(200_000);
  });
});
