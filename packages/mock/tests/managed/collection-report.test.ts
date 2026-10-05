import { describe, expect, it } from "vitest";

import { remember, reportCollection } from "../../src/managed/collection-report";

function records(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, id) => ({ id, name: `user ${id}` }));
}

describe("reportCollection", () => {
  it("reports a collection never reported whole", () => {
    const users = records(2);

    expect(reportCollection("users", undefined, remember(users))).toEqual({
      name: "users",
      count: 2,
      records: users,
    });
  });

  it("returns null when nothing changed", () => {
    const users = records(3);

    expect(reportCollection("users", remember(users), remember([...users]))).toBeNull();
  });

  it("reports a record added after the others as that record alone", () => {
    const users = records(1000);
    const before = remember(users);
    const added = { id: 1000, name: "Ada" };

    const report = reportCollection("users", before, remember([...users, added]));

    expect(report).toEqual({
      name: "users",
      count: 1001,
      edits: { removed: [], changed: [], added: [added] },
    });
  });

  it("reports a record a handler changed in place by its index", () => {
    const users = records(10);
    const before = remember(users);
    const changed = users[4];
    if (changed === undefined) throw new Error("no user 4");
    changed.name = "Grace";

    const report = reportCollection("users", before, remember([...users]));

    expect(report).toEqual({
      name: "users",
      count: 10,
      edits: { removed: [], changed: [{ index: 4, record: changed }], added: [] },
    });
  });

  it("reports the records gone by their indexes, and the changed ones at their new indexes", () => {
    const users = records(10);
    const before = remember(users);
    const kept = users.filter((_, index) => index !== 2 && index !== 5);
    const changed = kept[6];
    if (changed === undefined) throw new Error("no record at 6");
    changed.name = "Linus";

    const report = reportCollection("users", before, remember(kept));

    expect(report).toEqual({
      name: "users",
      count: 8,
      edits: { removed: [2, 5], changed: [{ index: 6, record: changed }], added: [] },
    });
  });

  it("reports a collection whole when its records moved", () => {
    const users = records(10);
    const before = remember(users);
    const moved = [...users].reverse();

    expect(reportCollection("users", before, remember(moved))).toEqual({
      name: "users",
      count: 10,
      records: moved,
    });
  });

  it("reports a collection whole when a record is added before others", () => {
    const users = records(10);
    const before = remember(users);
    const after = [{ id: -1, name: "first" }, ...users];

    expect(reportCollection("users", before, remember(after))).toEqual({
      name: "users",
      count: 11,
      records: after,
    });
  });

  it("reports a collection whole when that weighs no more than its edits", () => {
    const users = records(10);
    const before = remember(users);
    const reseeded = records(10);

    expect(reportCollection("users", before, remember(reseeded))).toEqual({
      name: "users",
      count: 10,
      records: reseeded,
    });
  });

  it("reports a cleared collection as empty, not as every index gone", () => {
    const before = remember(records(5000));

    expect(reportCollection("users", before, remember([]))).toEqual({
      name: "users",
      count: 0,
      records: [],
    });
  });

  it("reports a record the store holds twice by the second one added", () => {
    const users = records(4);
    const before = remember(users);
    const twice = users[0];
    if (twice === undefined) throw new Error("no user 0");

    const report = reportCollection("users", before, remember([...users, twice]));

    expect(report).toEqual({
      name: "users",
      count: 5,
      edits: { removed: [], changed: [], added: [twice] },
    });
  });
});
