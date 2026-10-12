/**
 * Self-test for `scripts/test-frameworks.mjs`: which framework versions a
 * run checks, and whether every version the matrix lists can be built from
 * what the repository holds.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { idsOf, selected } from "./test-frameworks.mjs";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const FRAMEWORKS = join(ROOT, "e2e/frameworks");

describe("the matrix's ids", () => {
  it("are read in the matrix's order", () => {
    expect(idsOf([{ id: "next-15" }, { id: "nuxt-4" }])).toEqual(["next-15", "nuxt-4"]);
  });

  it("are refused when the file holds no list", () => {
    expect(() => idsOf({ id: "next-15" })).toThrow("is not a list");
  });

  it("are refused when an entry has none", () => {
    expect(() => idsOf([{ id: "next-15" }, { app: "nuxt" }])).toThrow("entry 1 has no id");
  });

  it("are refused when one is listed twice", () => {
    expect(() => idsOf([{ id: "next-15" }, { id: "next-15" }])).toThrow("next-15 is listed twice");
  });
});

describe("a run", () => {
  const ids = ["next-14", "next-15", "nuxt-4"];

  it("checks every version when none is named", () => {
    expect(selected(ids, [])).toEqual(ids);
  });

  it("checks the versions named, in the matrix's order", () => {
    expect(selected(ids, ["nuxt-4", "next-14"])).toEqual(["next-14", "nuxt-4"]);
  });

  it("is refused for a version the matrix does not list, naming the ones it does", () => {
    expect(() => selected(ids, ["next-13"])).toThrow(
      "Not in e2e/frameworks/targets.json: next-13. It lists: next-14, next-15, nuxt-4",
    );
  });
});

describe("every version in the matrix", () => {
  const targets = JSON.parse(readFileSync(join(FRAMEWORKS, "targets.json"), "utf8"));

  it.each(targets.map((target) => [target.id, target]))(
    "%s is built from templates and packages the repository holds",
    (_id, target) => {
      const templates = [target.app, ...(target.overlays ?? [])];
      const missingTemplates = templates.filter(
        (name) => !existsSync(join(FRAMEWORKS, "apps", name)),
      );
      const missingPackages = target.packages.filter(
        (name) => !existsSync(join(ROOT, "packages", name, "package.json")),
      );

      expect(missingTemplates).toEqual([]);
      expect(missingPackages).toEqual([]);
      expect(Object.keys(target.install).length).toBeGreaterThan(0);
    },
  );
});
