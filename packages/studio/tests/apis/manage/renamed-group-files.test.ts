/**
 * A group Studio now names otherwise than the files of an import written
 * before — a tag that spells no name, `***`, is named after its path,
 * `users`, where Studio 0.3.0 named it `group` — is written from the file it was in,
 * paired as the inventory pairs it: merged by path alone, its endpoints a
 * user added or edited stayed in that file, another group's now, or went
 * with it.
 */
import { describe, expect, it } from "vitest";

import { resolveImportLayout } from "../../../src/apis/layout";
import { renamedGroupFiles } from "../../../src/apis/manage/renamed-group-files";
import { parseSpec } from "../../../src/apis/parser";
import { unknownRemovals } from "../../../src/server/unknown-removals";

const LAYOUT = resolveImportLayout({ outputDir: "src/api" }, "shop");

const OK = { "200": { description: "ok" } };

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Shop", version: "1" },
    servers: [{ url: "https://shop.test" }],
    paths: {
      "/users": { get: { operationId: "listUsers", tags: ["***"], responses: OK } },
      "/things": { get: { operationId: "getThing", tags: ["+++"], responses: OK } },
    },
  }),
);

function groupFile(name: string, endpoints: readonly string[]): string {
  return [
    'import { courier, defineGroup } from "@noverax/courier/define";',
    "",
    "const { endpoint } = courier();",
    "",
    `export const ${name} = defineGroup({`,
    '  prefix: "/",',
    "  endpoints: {",
    ...endpoints.map((endpoint) => `    ${endpoint}: endpoint.get(""),`),
    "  },",
    "});",
    "",
  ].join("\n");
}

/* As Studio 0.3.0 wrote the two groups, whose tags spell no name: `group` and `group2`. */
const FILES = {
  "src/api/shop/group/index.ts": groupFile("group", ["listUsers", "searchUsers"]),
  "src/api/shop/group2/index.ts": groupFile("group2", ["getThing"]),
};

describe("renamedGroupFiles", () => {
  it("gives each renamed group's file the file on disk its group was written to", () => {
    expect(SPEC.groups.map((group) => group.name)).toEqual(["users", "things"]);
    expect(renamedGroupFiles(SPEC, "tag", LAYOUT, FILES)).toEqual(
      new Map([
        ["src/api/shop/users/index.ts", "src/api/shop/group/index.ts"],
        ["src/api/shop/things/index.ts", "src/api/shop/group2/index.ts"],
      ]),
    );
  });

  it("gives none for an import whose groups keep their names", () => {
    const files = {
      "src/api/shop/users/index.ts": groupFile("users", ["listUsers"]),
      "src/api/shop/things/index.ts": groupFile("things", ["getThing"]),
    };

    expect(renamedGroupFiles(SPEC, "tag", LAYOUT, files).size).toBe(0);
  });
});

describe("unknownRemovals, of an import whose groups Studio names otherwise", () => {
  it("finds an endpoint of a renamed group in the file it was written to", () => {
    const moved = renamedGroupFiles(SPEC, "tag", LAYOUT, FILES);

    expect(
      unknownRemovals(
        { users: ["searchUsers"], things: ["getThing"] },
        LAYOUT,
        FILES,
        false,
        moved,
      ),
    ).toEqual([]);
    expect(unknownRemovals({ users: ["nosuch"] }, LAYOUT, FILES, false, moved)).toEqual([
      "users.nosuch",
    ]);
    expect(unknownRemovals({ users: ["searchUsers"] }, LAYOUT, FILES, false)).toEqual([
      "users.searchUsers",
    ]);
  });
});
