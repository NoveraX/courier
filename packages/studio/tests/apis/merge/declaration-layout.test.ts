/**
 * A merge cuts a file into its imports, the code above its declaration, the
 * declaration around its endpoints, each endpoint and the code below. The
 * cuts are found by the file's syntax: a description written into a doc
 * comment or a string — lines that read `endpoints: {` or
 * `export const X = defineGroup({`, brackets left open — is text, and moves
 * none of them. A file that cannot be cut into whole lines has no layout.
 */
import { describe, expect, it } from "vitest";

import { readLayout } from "../../../src/apis/merge/declaration-layout";

const DESCRIPTION = [
  "first line",
  '    ZZ_INJECTED: endpoint.get("zz"),',
  "  },",
  "  endpoints: {",
  "export const ZZ_INJECTED = defineGroup({",
  '  prefix: "/hijacked",',
  "*\\/ ZZ_INJECTED /*",
  "{{{ ((( [[[ `tick` 'single' \"double\"",
].join("\n");

const HOSTILE = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const things = defineGroup({
  prefix: "/things",
  endpoints: {
    /** ${DESCRIPTION} */
    listThings: endpoint.get("").meta({ description: "}}} ))) ]]] export const ZZ_INJECTED = defineGroup({" }),
    makeThing: endpoint.post("").variables<{ /** ${DESCRIPTION} */ q?: string }>(),
  },
});

export function helper(): string {
  return "})";
}
`;

describe("a file whose descriptions read like code", () => {
  const layout = readLayout(HOSTILE);

  it("is cut where its syntax is, not where its comments and strings read like code", () => {
    expect(layout?.header).toEqual([
      "export const things = defineGroup({",
      '  prefix: "/things",',
      "  endpoints: {",
    ]);
    expect(layout?.footer).toEqual(["  },", "});"]);
    expect(layout?.endpoints.map((entry) => entry.name)).toEqual(["listThings", "makeThing"]);
    expect(layout?.trailing).toEqual(["export function helper(): string {", '  return "})";', "}"]);
  });

  it("keeps each endpoint whole, with the doc comment above it", () => {
    const [list, make] = layout?.endpoints ?? [];

    expect(list?.comment).toBe(`    /** ${DESCRIPTION} */`);
    expect(list?.code).toContain('defineGroup({" }),');
    expect(make?.code).toBe(
      `    makeThing: endpoint.post("").variables<{ /** ${DESCRIPTION} */ q?: string }>(),`,
    );
  });

  it("reads the declaration's prefix and name from its syntax", () => {
    expect(layout?.declaration.prefix).toBe("/things");
    expect(layout?.declaration.name).toBe("things");
  });
});

describe("the code above the declaration", () => {
  const ABOVE = `#!/usr/bin/env node
/* Licence text. */
import {
  courier,
  defineGroup,
} from "@noverax/courier/define";

import { helper } from "../helper";
// A note between imports.
import type { Pet } from "./schemas";

const { endpoint } = courier({
  timeout: 10_000,
});

/** The pets. */
export const pets = defineGroup({
  prefix: "/pets",
  endpoints: {
    list: endpoint.get("").response<Pet[]>(helper),
  },
});
`;
  const layout = readLayout(ABOVE);

  it("reads every import, a wrapped one and one after a blank line too", () => {
    expect(layout?.imports.map((statement) => statement.source.value)).toEqual([
      "@noverax/courier/define",
      "../helper",
      "./schemas",
    ]);
  });

  it("keeps what sits above the first import as written", () => {
    expect(layout?.head).toEqual(["#!/usr/bin/env node", "/* Licence text. */"]);
  });

  it("takes no line of an import for the preamble", () => {
    expect(layout?.preamble).toEqual([
      "// A note between imports.",
      "const { endpoint } = courier({",
      "  timeout: 10_000,",
      "});",
      "/** The pets. */",
    ]);
  });
});

describe("a file that cannot be cut into whole lines", () => {
  const group = (
    endpoints: string,
  ): string => `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
${endpoints}
  },
});
`;

  it.each([
    ["a spread among the endpoints", '    list: endpoint.get(""),\n    ...legacy,'],
    ["a computed key", '    [name]: endpoint.get(""),'],
    ["two endpoints on one line", '    list: endpoint.get(""), mine: endpoint.get("mine"),'],
    [
      "a doc comment on the line of the endpoint before it",
      '    a: endpoint.get(""), /** b */\n    b: endpoint.get("b"),',
    ],
  ])("has no layout: %s", (_shape, endpoints) => {
    expect(readLayout(group(endpoints))).toBeNull();
  });

  it("has no layout when two statements share a line", () => {
    const shared = group('    list: endpoint.get(""),').replace(
      "const { endpoint } = courier();",
      "const { endpoint } = courier(); const other = 1;",
    );

    expect(readLayout(shared)).toBeNull();
  });

  it("has no layout when it does not parse", () => {
    expect(readLayout(group('    broken: endpoint.get("x".response(),'))).toBeNull();
  });
});

describe("endpoints written on the declaration's own line", () => {
  it("are cut at their braces, keeping the declaration's other options", () => {
    const layout = readLayout(
      'export const users = defineGroup({ prefix: "/users", headers: { a: "b" }, endpoints: {} });\n',
    );

    expect(layout?.header).toEqual([
      'export const users = defineGroup({ prefix: "/users", headers: { a: "b" }, endpoints: {',
    ]);
    expect(layout?.footer).toEqual(["} });"]);
    expect(layout?.endpoints).toEqual([]);
  });
});
