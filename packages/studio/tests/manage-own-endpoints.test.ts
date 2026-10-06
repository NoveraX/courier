/**
 * The API's own endpoints sit in its source beside its groups. Managing
 * them edits the source as code: the first one brings an `endpoints` object
 * a source of groups alone lacks, and the last one takes away what only
 * they needed, leaving the source as a write of groups alone has it. Every
 * other character of the file stays as it is.
 */
import { describe, expect, it } from "vitest";

import { withEndpointsObject } from "../src/apis/manage/endpoints-object";
import { mergeSchemaFiles } from "../src/apis/manage/merge-schemas";
import { withoutEmptyEndpoints } from "../src/apis/manage/prune-own-endpoints";
import { UnrecognizedFileError } from "../src/apis/manage/unrecognized-file-error";

const SOURCE = "src/api/shop/source.ts";

const GROUPS_ONLY = [
  'import { defineApi } from "@noverax/courier/define";',
  'import { pets } from "./pets/index";',
  "",
  "export const shop = defineApi({",
  '  baseURL: "https://shop.example",',
  "  // the shop's groups",
  "  groups: {",
  "    /** Pets for sale */",
  "    pets,",
  "  },",
  "});",
  "",
].join("\n");

describe("withEndpointsObject", () => {
  it("puts an empty endpoints object right before the groups, on a line of its own", () => {
    const text = GROUPS_ONLY.replace("  // the shop's groups\n", "");

    expect(withEndpointsObject(SOURCE, text)).toBe(
      text.replace("  groups: {", "  endpoints: {},\n  groups: {"),
    );
  });

  it("goes above the doc comment of the groups, which stays with them", () => {
    const text = GROUPS_ONLY.replace("  // the shop's groups\n", "  /** The shop's groups */\n");

    expect(withEndpointsObject(SOURCE, text)).toContain(
      "  endpoints: {},\n  /** The shop's groups */\n  groups: {",
    );
  });

  it("writes it inline in a config written on one line", () => {
    const text =
      'import { defineApi } from "x";\nexport const s = defineApi({ baseURL: "/", groups: { a } });\n';

    expect(withEndpointsObject(SOURCE, text)).toContain(
      'defineApi({ baseURL: "/", endpoints: {}, groups: { a } })',
    );
  });

  it("leaves a source that has one as it is, and refuses one that declares no API", () => {
    const flat = 'export const s = defineApi({ baseURL: "/", endpoints: { a: x } });\n';

    expect(withEndpointsObject(SOURCE, flat)).toBe(flat);
    expect(() => withEndpointsObject(SOURCE, "export const s = 1;\n")).toThrow(
      UnrecognizedFileError,
    );
  });
});

describe("withoutEmptyEndpoints", () => {
  const withOwn = (endpoints: string) =>
    [
      'import { courier, defineApi } from "@noverax/courier/define";',
      'import { pets } from "./pets/index";',
      "",
      "const { endpoint } = courier();",
      "",
      "export const shop = defineApi({",
      '  baseURL: "https://shop.example",',
      `  endpoints: {${endpoints}},`,
      "  groups: {",
      "    pets,",
      "  },",
      "});",
      "",
    ].join("\n");

  it("takes away the empty object, the builders and their import beside groups", () => {
    expect(withoutEmptyEndpoints(SOURCE, withOwn("\n  "))).toBe(
      GROUPS_ONLY.replace("  // the shop's groups\n", "").replace("    /** Pets for sale */\n", ""),
    );
  });

  it("leaves a source that still holds endpoints, or holds no group, as it is", () => {
    const holding = withOwn('\n    health: endpoint.get("health"),\n  ');
    const flat = withOwn("\n  ").replace("  groups: {\n    pets,\n  },\n", "");

    expect(withoutEmptyEndpoints(SOURCE, holding)).toBe(holding);
    expect(withoutEmptyEndpoints(SOURCE, flat)).toBe(flat);
  });

  it("keeps builders the rest of the file still uses", () => {
    const used = `${withOwn("\n  ")}export const extra = endpoint.get("extra");\n`;

    const pruned = withoutEmptyEndpoints(SOURCE, used);

    expect(pruned).not.toContain("endpoints:");
    expect(pruned).toContain("const { endpoint } = courier();");
    expect(pruned).toContain('import { courier, defineApi } from "@noverax/courier/define";');
  });
});

describe("mergeSchemaFiles with names from the import's module", () => {
  it("joins them to the file's import of that module rather than import it twice", () => {
    const existing = [
      'import { z } from "zod";',
      'import { MoneySchema } from "../schemas";',
      "",
      "export const PetSchema = z.object({ price: MoneySchema });",
      "",
    ].join("\n");
    const generated = [
      'import { z } from "zod";',
      'import { MoneySchema, TagSchema } from "../schemas";',
      "",
      "export const ToySchema = z.object({ tag: TagSchema, price: MoneySchema });",
      "",
    ].join("\n");

    const merged = mergeSchemaFiles("src/api/shop/pets/schemas.ts", existing, generated, [
      "ToySchema",
    ]);

    expect(merged.match(/from "\.\.\/schemas"/g)).toHaveLength(1);
    expect(merged).toContain('import { MoneySchema, TagSchema } from "../schemas";');
    expect(merged).toContain("export const ToySchema");
  });

  it("brings ArkType's type namespace with the cycle helper that reads it", () => {
    const existing =
      'import { type } from "arktype";\n\nexport const ASchema = type({ a: "string" });\n';
    const generated = [
      'import type * as ark from "arktype";',
      'import { type } from "arktype";',
      "",
      "let declared = false;",
      "function lazy(base: ark.Type, resolve: () => unknown) { return base; }",
      "",
      'export const NSchema = lazy(type("unknown"), () => NSchema);',
      "",
      "declared = true;",
      "",
    ].join("\n");

    const merged = mergeSchemaFiles("src/api/shop/n/schemas.ts", existing, generated, ["NSchema"]);

    expect(merged).toContain('import type * as ark from "arktype";');
    expect(merged.match(/import \{ type \} from "arktype";/g)).toHaveLength(1);
  });
});
