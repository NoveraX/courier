import { describe, expect, it } from "vitest";

import { readStoreReport } from "../src/mock-store";

const edits = { removed: [0], changed: [{ index: 0, record: { id: 2 } }], added: [{ id: 3 }] };

describe("readStoreReport", () => {
  it("reads a report of whole collections and edits", () => {
    const event = {
      type: "mock:store:changes",
      seq: 4,
      whole: false,
      collections: [
        { name: "users", count: 2, edits },
        { name: "posts", count: 0, records: [] },
      ],
      removed: ["tags"],
    };

    expect(readStoreReport(event)).toEqual({
      seq: 4,
      whole: false,
      collections: [
        { name: "users", count: 2, edits },
        { name: "posts", count: 0, records: [] },
      ],
      removed: ["tags"],
    });
  });

  it.each([
    ["a seq that is no count", { seq: -1 }],
    ["a seq that is no whole number", { seq: 1.5 }],
    ["no word on whether it is whole", { whole: "yes" }],
    ["collections that are no list", { collections: {} }],
    ["a collection gone that has no name", { removed: [1] }],
    ["a collection with no name", { collections: [{ count: 0, records: [] }] }],
    ["a collection with no count", { collections: [{ name: "users", records: [] }] }],
    ["a collection with neither records nor edits", { collections: [{ name: "users", count: 0 }] }],
    [
      "edits that remove no index",
      { collections: [{ name: "users", count: 0, edits: { ...edits, removed: ["0"] } }] },
    ],
    [
      "a change with no index",
      {
        collections: [{ name: "users", count: 0, edits: { ...edits, changed: [{ record: {} }] } }],
      },
    ],
    [
      "added records that are no list",
      { collections: [{ name: "users", count: 0, edits: { ...edits, added: {} } }] },
    ],
  ])("returns undefined for %s", (_, fields) => {
    const event = { seq: 1, whole: false, collections: [], removed: [], ...fields };

    expect(readStoreReport(event)).toBeUndefined();
  });
});
