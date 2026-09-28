/**
 * An endpoint whose closure writes its query with `formQuery`, or its form
 * body with `formBody`, lands in a group file generated without either:
 * adding it, or merging an update that brings it, imports the helper beside
 * the file's own names from `@noverax/courier/define`.
 */
import { parseSync } from "oxc-parser";
import { describe, expect, it } from "vitest";

import { appendEndpointsToGroup } from "../src/apis/manage/append-to-group";
import { mergeGroupFile } from "../src/apis/merge/merge-group";
import type { FingerprintResult } from "../src/apis/merge/types";

const PATH = "src/api/shop/customers/index.ts";

function groupFile(imports: string, entries: string[]): string {
  return [
    `import { ${imports} } from "@noverax/courier/define";`,
    "",
    "const { endpoint } = courier();",
    "",
    "export const customers = defineGroup({",
    '  prefix: "/customers",',
    "  endpoints: {",
    ...entries,
    "  },",
    "});",
    "",
  ].join("\n");
}

const GET = '    get: endpoint.get(":id").response<unknown>(),';
const LIST =
  '    list: endpoint.variables<{ expand?: string[] }>().via((http, vars) => http.get("", formQuery(vars, { expand: { style: "deepObject", explode: true } }))).response<unknown>(),';
const UPDATE =
  '    update: endpoint.variables<{ id: string; name?: string }>().via((http, { id, ...body }) => http.post(":id", undefined, { body: formBody(body) })).response<unknown>(),';
const GENERATED = groupFile("courier, defineGroup, formBody, formQuery", [GET, LIST, UPDATE]);
const ON_DISK = groupFile("courier, defineGroup", [GET]);

function imports(code: string): string[] {
  const line = code.split("\n").find((text) => text.includes('from "@noverax/courier/define"')) ?? "";
  return (line.match(/\{([^}]*)\}/)?.[1] ?? "").split(",").map((name) => name.trim());
}

function parses(code: string): boolean {
  return parseSync("index.ts", code).errors.length === 0;
}

describe("adding endpoints that write with the define helpers", () => {
  it("imports formQuery for one that writes its query with it", () => {
    const merged = appendEndpointsToGroup(PATH, ON_DISK, GENERATED, ["list"]);

    expect(imports(merged)).toEqual(expect.arrayContaining(["courier", "defineGroup", "formQuery"]));
    expect(imports(merged)).not.toContain("formBody");
    expect(parses(merged)).toBe(true);
  });

  it("imports formBody and formQuery together when both are used", () => {
    const merged = appendEndpointsToGroup(PATH, ON_DISK, GENERATED, ["list", "update"]);

    expect(imports(merged)).toEqual(expect.arrayContaining(["formBody", "formQuery"]));
  });
});

describe("merging an update that brings them", () => {
  const fingerprints: FingerprintResult = {
    endpoints: { get: "safe", list: "new", update: "new" },
    existingCode: {},
  };

  it("imports each helper the new endpoints use", () => {
    const { content } = mergeGroupFile(ON_DISK, GENERATED, fingerprints);

    expect(imports(content)).toEqual(expect.arrayContaining(["courier", "defineGroup", "formBody", "formQuery"]));
    expect(content).toContain("formQuery(vars");
    expect(parses(content)).toBe(true);
  });
});
