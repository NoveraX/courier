/**
 * A group Manage adds to a file is reached by a name the file binds to
 * nothing else: the one asked for, the import already there when the file
 * imports that very group under it, or the first numbered name left free.
 * Under a name bound to something else, it was listed but wired to that.
 */
import { describe, expect, it } from "vitest";

import { addGroupsToGroupFile } from "../../../src/apis/manage/update-group-file";
import { addGroupsToSourceFile } from "../../../src/apis/manage/update-source-file";

const SOURCE = [
  'import { courier, defineApi } from "@noverax/courier/define";',
  'import { pets } from "./pets/index";',
  'import { StoreSchema as store } from "./schemas";',
  "",
  "export const shop = defineApi({",
  '  baseURL: "https://shop.test",',
  "  groups: {",
  "    pets,",
  "  },",
  "});",
  "",
].join("\n");

describe("addGroupsToSourceFile", () => {
  it("imports a group under a free name where the file binds its own to something else", () => {
    const added = addGroupsToSourceFile("src/api/shop/source.ts", SOURCE, [
      { name: "store", local: "store", importPath: "./store/index" },
    ]);

    expect(added).toContain('import { store as store_2 } from "./store/index";');
    expect(added).toContain("store: store_2,");
  });

  it("lists a group the file imports already under its name, without a second import", () => {
    const imported = SOURCE.replace("  groups: {\n    pets,\n", "  groups: {\n");
    const added = addGroupsToSourceFile("src/api/shop/source.ts", imported, [
      { name: "pets", local: "pets", importPath: "./pets/index" },
    ]);

    expect(added.match(/from "\.\/pets\/index"/g)).toHaveLength(1);
    expect(added).toContain("    pets,");
  });
});

describe("addGroupsToGroupFile", () => {
  it("imports a group inside one named as its alias under a free name", () => {
    const parent = [
      'import { defineGroup } from "@noverax/courier/define";',
      "",
      "export const petsGroup = defineGroup({",
      '  prefix: "/pets",',
      "  endpoints: {},",
      "});",
      "",
    ].join("\n");

    const added = addGroupsToGroupFile("src/api/shop/pets-group/index.ts", parent, "petsGroup", [
      { name: "pets", local: "petsGroup", importPath: "../pets/index" },
    ]);

    expect(added).toContain('import { pets as petsGroup_2 } from "../pets/index";');
    expect(added).toContain("pets: petsGroup_2");
  });
});
