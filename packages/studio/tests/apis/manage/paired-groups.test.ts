/**
 * Each group of the specification is read with the group on disk it is: a
 * group that keeps its name and an endpoint is itself; a renamed one —
 * `undefined` to `undefinedGroup`, `group3` to `group` — is the group on
 * disk holding the most of its endpoints, where each is the other's one
 * best match; the rest pair by name. Paired by name alone, a renamed group
 * read as gone and Manage dropped its endpoints.
 */
import { describe, expect, it } from "vitest";

import type { DiskGroupInfo, SpecGroupInfo } from "../../../src/apis/manage/inventory-indexers";
import { pairedGroups } from "../../../src/apis/manage/paired-groups";
import { seededRandom } from "../../helpers/seeded-random";

const spec = (endpoints: string[]): SpecGroupInfo => ({
  prefix: "/",
  endpoints: endpoints.map((endpoint) => ({
    name: endpoint,
    httpMethod: "get",
    path: `/${endpoint}`,
  })),
});
const disk = (endpoints: string[]): DiskGroupInfo => ({
  prefix: "/",
  endpoints,
  file: "src/api/shop/x/index.ts",
});

describe("pairedGroups", () => {
  it("reads a group renamed as a reserved name's is as the group on disk it was", () => {
    const pairs = pairedGroups(
      new Map([
        ["undefinedGroup", spec(["makeThing", "listThings"])],
        ["pets", spec(["listPets"])],
      ]),
      new Map([
        ["undefined", disk(["makeThing", "listThings"])],
        ["pets", disk(["listPets"])],
      ]),
    );

    expect(pairs).toEqual(
      new Map([
        ["pets", "pets"],
        ["undefinedGroup", "undefined"],
      ]),
    );
  });

  it("reads a name that moved to another group's endpoints as that group, and the first by its endpoints", () => {
    const pairs = pairedGroups(
      new Map([
        ["users", spec(["listUsers", "getUser"])],
        ["group", spec(["getThing"])],
      ]),
      new Map([
        ["group", disk(["listUsers", "getUser"])],
        ["group3", disk(["getThing"])],
      ]),
    );

    expect(pairs).toEqual(
      new Map([
        ["users", "group"],
        ["group", "group3"],
      ]),
    );
  });

  it("keeps a group that kept its name and an endpoint, though another holds more of them", () => {
    const pairs = pairedGroups(
      new Map([
        ["pets", spec(["listPets"])],
        ["animals", spec(["getPet", "addPet"])],
      ]),
      new Map([["pets", disk(["listPets", "getPet", "addPet"])]]),
    );

    expect(pairs).toEqual(new Map([["pets", "pets"]]));
  });

  it("pairs by its endpoints only the one best match", () => {
    const tied = pairedGroups(
      new Map([
        ["a", spec(["one"])],
        ["b", spec(["one"])],
      ]),
      new Map([["group", disk(["one"])]]),
    );
    const sharedByTwo = pairedGroups(
      new Map([["users", spec(["one", "two"])]]),
      new Map([
        ["group", disk(["one"])],
        ["group2", disk(["two"])],
      ]),
    );

    expect(tied.size).toBe(0);
    expect(sharedByTwo.size).toBe(0);
  });

  it("pairs, once a better match is taken, the groups left that are each other's best, in any order", () => {
    const specMap = new Map([
      ["users", spec(["listUsers", "getUser"])],
      ["admins", spec(["listUsers"])],
    ]);
    const first = disk(["listUsers", "getUser"]);
    const second = disk(["listUsers"]);
    const expected = new Map([
      ["users", "group"],
      ["admins", "group2"],
    ]);

    expect(
      pairedGroups(
        specMap,
        new Map([
          ["group", first],
          ["group2", second],
        ]),
      ),
    ).toEqual(expected);
    expect(
      pairedGroups(
        specMap,
        new Map([
          ["group2", second],
          ["group", first],
        ]),
      ),
    ).toEqual(expected);
  });

  it("pairs by name a group that shares no endpoint, and nothing else", () => {
    const pairs = pairedGroups(
      new Map([
        ["users", spec(["a"])],
        ["orders", spec(["b"])],
      ]),
      new Map([
        ["users", disk(["c"])],
        ["group", disk(["d"])],
      ]),
    );

    expect(pairs).toEqual(new Map([["users", "users"]]));
  });

  it("finds every group renamed, however the names move, in any order", () => {
    const POOL = ["group", "group2", "group3", "users", "orders", "undefined", "undefinedGroup"];
    for (let seed = 0; seed < 2_000; seed++) {
      const next = seededRandom(seed);
      const names = shuffled(POOL, next).slice(0, 1 + next(POOL.length));
      const renamed = shuffled(POOL, next).slice(0, names.length);
      const groups = names.map((name, index) => ({
        name,
        was: renamed[index] ?? "",
        endpoints: Array.from({ length: 1 + next(3) }, (_, n) => `${name}:${n}`),
      }));
      const specMap = new Map(groups.map((group) => [group.name, spec(group.endpoints)]));
      const diskMap = new Map(
        shuffled(groups, next).map((group) => [group.was, disk(group.endpoints)]),
      );

      expect(pairedGroups(specMap, diskMap)).toEqual(
        new Map(groups.map((group) => [group.name, group.was])),
      );
    }
  });
});

function shuffled<TItem>(items: readonly TItem[], next: (below: number) => number): TItem[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = next(index + 1);
    [copy[index], copy[other]] = [copy[other] as TItem, copy[index] as TItem];
  }
  return copy;
}
