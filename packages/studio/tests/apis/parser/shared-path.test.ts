/**
 * The path a set of paths shares, gathered a path or a set at a time: the
 * same prefix whichever order the paths and sets come in.
 */
import { describe, expect, it } from "vitest";

import {
  joinSharedPaths,
  NO_PATHS,
  type SharedPath,
  sharedPathOf,
  sharedPrefix,
} from "../../../src/apis/parser/shared-path";
import { seededRandom } from "../../helpers/seeded-random";

function gathered(paths: readonly string[]): SharedPath {
  return paths.map(sharedPathOf).reduce(joinSharedPaths, NO_PATHS);
}

describe("sharedPrefix", () => {
  it("is / when no path is gathered", () => {
    expect(sharedPrefix(NO_PATHS)).toBe("/");
  });

  it("takes the parent of a lone path, a parameter in it included", () => {
    expect(sharedPrefix(gathered(["/pets/{id}/toys"]))).toBe("/pets/{id}");
    expect(sharedPrefix(gathered(["/pets"]))).toBe("/");
    expect(sharedPrefix(gathered(["/"]))).toBe("/");
  });

  it("takes what several paths share, up to their first parameter", () => {
    expect(sharedPrefix(gathered(["/billing/invoices", "/billing/invoices/{id}"]))).toBe(
      "/billing/invoices",
    );
    expect(sharedPrefix(gathered(["/a/{id}/b", "/a/{id}/c"]))).toBe("/a");
    expect(sharedPrefix(gathered(["/a/:id/b", "/a/:id/c"]))).toBe("/a");
    expect(sharedPrefix(gathered(["/a", "/b"]))).toBe("/");
  });

  it("counts the same path twice as two paths", () => {
    expect(sharedPrefix(gathered(["/pets/mine", "/pets/mine"]))).toBe("/pets/mine");
  });
});

describe("joinSharedPaths", () => {
  it("leaves a set as it is when the other holds no path", () => {
    const pets = gathered(["/pets/{id}", "/pets"]);

    expect(joinSharedPaths(pets, NO_PATHS)).toBe(pets);
    expect(joinSharedPaths(NO_PATHS, pets)).toBe(pets);
  });

  it("gives one prefix whichever order paths and sets are gathered in, on 5 000 random sets", () => {
    const segments = ["a", "b", "{id}", ":id"];
    for (let seed = 1; seed <= 5_000; seed += 1) {
      const next = seededRandom(seed);
      const paths = Array.from(
        { length: next(6) },
        () => `/${Array.from({ length: next(4) }, () => segments[next(4)]).join("/")}`,
      );
      const cut = next(paths.length + 1);
      const inTwo = joinSharedPaths(gathered(paths.slice(cut)), gathered(paths.slice(0, cut)));

      expect(inTwo).toEqual(gathered(paths));
      expect(sharedPrefix(gathered(paths.toReversed()))).toBe(sharedPrefix(gathered(paths)));
    }
  });
});
