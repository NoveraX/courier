/**
 * Adding endpoints to a file Studio generated and the user edited: the new
 * endpoints go last in its `endpoints`, and every line the user wrote stays
 * as it is — wrapped endpoints, comments, spreads, the base — so the file
 * still parses.
 */
import { parseSync } from "oxc-parser";
import { describe, expect, it } from "vitest";

import { appendEndpointsToGroup } from "../src/apis/manage/append-to-group";

const PATH = "src/api/pets/pets/index.ts";

const GENERATED = [
  'import { courier, defineGroup } from "@noverax/courier/define";',
  'import { PetSchema } from "./schemas";',
  "",
  "const { endpoint } = courier();",
  "",
  "export const pets = defineGroup({",
  '  prefix: "/pets",',
  "  endpoints: {",
  '    createPet: endpoint.post("").body(PetSchema),',
  "  },",
  "});",
  "",
].join("\n");

function edited(endpoints: string[]): string {
  return [
    'import { courier, defineGroup } from "@noverax/courier/define";',
    'import { extra } from "./extra";',
    "",
    "const { endpoint } = courier();",
    "",
    "export const pets = defineGroup({",
    '  prefix: "/pets",',
    "  endpoints: {",
    ...endpoints,
    "  },",
    "});",
    "",
    "export const helper = 1;",
    "",
  ].join("\n");
}

function parses(code: string): boolean {
  return parseSync("index.ts", code).errors.length === 0;
}

describe("appendEndpointsToGroup", () => {
  it("adds after an endpoint wrapped across lines with objects of its own", () => {
    const existing = edited([
      '    listPets: endpoint.get("", {',
      "      meta: {",
      "        cache: true,",
      "      },",
      "    }),",
      '    getPet: endpoint.get("/{id}"),',
    ]);

    const merged = appendEndpointsToGroup(PATH, existing, GENERATED, ["createPet"]);

    expect(parses(merged)).toBe(true);
    expect(merged.match(/getPet:/g)).toHaveLength(1);
    expect(merged).toContain(
      '    getPet: endpoint.get("/{id}"),\n    createPet: endpoint.post("").body(PetSchema),\n  },',
    );
  });

  it("keeps the user's comments, spreads and code after the declaration", () => {
    const existing = edited([
      '    listPets: endpoint.get(""),',
      "    // TODO: paging",
      "    ...extra,",
    ]);

    const merged = appendEndpointsToGroup(PATH, existing, GENERATED, ["createPet"]);

    expect(parses(merged)).toBe(true);
    expect(merged).toContain("    // TODO: paging\n    ...extra,\n    createPet:");
    expect(merged).toContain("export const helper = 1;");
    expect(merged).toContain('import { extra } from "./extra";');
    expect(merged).toContain('import { PetSchema } from "./schemas";');
  });

  it("separates a last entry left without a comma, even one closed by a comment", () => {
    const existing = edited([
      '    listPets: endpoint.get("https://x.example//list") // the old list',
    ]);

    const merged = appendEndpointsToGroup(PATH, existing, GENERATED, ["createPet"]);

    expect(parses(merged)).toBe(true);
    expect(merged).toContain('listPets: endpoint.get("https://x.example//list"), // the old list');
  });

  it("reads a comment with a quote in it, and commented-out code, as comments", () => {
    const quoted = edited(['    listPets: endpoint.get(""), // don\'t cache']);
    const blocked = edited([
      '    listPets: endpoint.get(""),',
      "    /*",
      '      oldPets: endpoint.get("/old")',
      "    */",
    ]);

    const first = appendEndpointsToGroup(PATH, quoted, GENERATED, ["createPet"]);
    const second = appendEndpointsToGroup(PATH, blocked, GENERATED, ["createPet"]);

    expect(parses(first)).toBe(true);
    expect(parses(second)).toBe(true);
    expect(first).toContain("// don't cache");
    expect(second).toContain('      oldPets: endpoint.get("/old")');
  });

  it("imports only what the file does not bind yet, wherever its imports are", () => {
    const existing = [
      'import { courier, defineGroup } from "@noverax/courier/define";',
      "",
      'import { PetSchema } from "./schemas";',
      "",
      "const { endpoint } = courier();",
      "",
      "export const pets = defineGroup({",
      '  prefix: "/pets",',
      "  endpoints: {",
      '    listPets: endpoint.get(""),',
      "  },",
      "});",
      "",
    ].join("\n");

    const merged = appendEndpointsToGroup(PATH, existing, GENERATED, ["createPet"]);

    expect(parses(merged)).toBe(true);
    expect(merged.match(/PetSchema }/g)).toHaveLength(1);
    expect(merged.match(/import /g)).toHaveLength(2);
  });

  it("keeps a base the file imports instead of declaring one", () => {
    const existing = [
      'import { defineGroup } from "@noverax/courier/define";',
      'import { endpoint } from "../base";',
      "",
      "export const pets = defineGroup({",
      '  prefix: "/pets",',
      "  endpoints: {",
      '    listPets: endpoint.get(""),',
      "  },",
      "});",
      "",
    ].join("\n");

    const merged = appendEndpointsToGroup(PATH, existing, GENERATED, ["createPet"]);

    expect(parses(merged)).toBe(true);
    expect(merged).not.toMatch(/import \{[^}]*\bcourier\b/);
    expect(merged).not.toContain("courier()");
    expect(merged).toContain('    createPet: endpoint.post("").body(PetSchema),');
  });

  it("declares the generated base when the file binds none", () => {
    const existing = [
      'import { defineGroup } from "@noverax/courier/define";',
      "",
      "export const pets = defineGroup({",
      '  prefix: "/pets",',
      "  endpoints: {},",
      "});",
      "",
    ].join("\n");

    const merged = appendEndpointsToGroup(PATH, existing, GENERATED, ["createPet"]);

    expect(parses(merged)).toBe(true);
    expect(merged).toContain("const { endpoint } = courier();");
    expect(merged).toMatch(/import \{ defineGroup, courier \} from|import \{ courier \} from/);
  });

  it("takes a generated endpoint whole, whatever lines it spans, in the base the file names", () => {
    const generated = [
      'import { courier, defineGroup } from "@noverax/courier/define";',
      "",
      "const { endpoint } = courier();",
      "",
      "export const pets = defineGroup({",
      '  prefix: "/pets",',
      "  endpoints: {",
      "    /**",
      "     * Create a pet.",
      "     */",
      '    "create-pet": endpoint',
      '      .post("")',
      "      .response<{ id: string }>(),",
      "  },",
      "});",
      "",
    ].join("\n");
    const existing = [
      'import { courier, defineGroup } from "@noverax/courier/define";',
      "",
      "const api = courier();",
      "",
      "export const pets = defineGroup({",
      '  prefix: "/pets",',
      "  endpoints: {",
      '    listPets: api.endpoint.get(""),',
      "  },",
      "});",
      "",
    ].join("\n");

    const merged = appendEndpointsToGroup(PATH, existing, generated, ["create-pet"]);

    expect(parses(merged)).toBe(true);
    expect(merged).toContain(
      '    /**\n     * Create a pet.\n     */\n    "create-pet": api.endpoint\n      .post("")\n      .response<{ id: string }>(),\n  },',
    );
  });

  it("adds to the declaration named as generated, not the first one in the file", () => {
    const existing = [
      'import { courier, defineGroup } from "@noverax/courier/define";',
      "",
      "const { endpoint } = courier();",
      "",
      "const internal = defineGroup({",
      '  prefix: "/internal",',
      "  endpoints: {",
      '    createPet: endpoint.post("/x"),',
      "  },",
      "});",
      "",
      "export const pets = defineGroup({",
      '  prefix: "/pets",',
      "  endpoints: {",
      '    listPets: endpoint.get(""),',
      "  },",
      "});",
      "",
    ].join("\n");

    const merged = appendEndpointsToGroup(PATH, existing, GENERATED, ["createPet"]);

    expect(parses(merged)).toBe(true);
    expect(merged).toContain(
      '    listPets: endpoint.get(""),\n    createPet: endpoint.post("").body(PetSchema),',
    );
  });

  it("uses a base the file configures, and imports nothing the added code does not use", () => {
    const existing = [
      'import { courier, defineGroup } from "@noverax/courier/define";',
      "",
      'const api = courier({ headers: { tenant: "a" } });',
      "",
      "const pets = defineGroup({",
      '  prefix: "/pets",',
      "  endpoints: {",
      '    listPets: api.endpoint.get(""),',
      "  },",
      "});",
      "",
      "export { pets };",
      "",
    ].join("\n");

    const merged = appendEndpointsToGroup(PATH, existing, GENERATED, ["createPet"]);

    expect(parses(merged)).toBe(true);
    expect(merged).toContain('createPet: api.endpoint.post("").body(PetSchema)');
    expect(merged).not.toContain("const { endpoint }");
    expect(merged.match(/courier/g)).toHaveLength(3);
  });

  it("declares a missing base above the declaration's doc comment, and after a byte order mark", () => {
    const existing = [
      "\uFEFF/** The pets group. */",
      "export const pets = defineGroup({",
      '  prefix: "/pets",',
      "  endpoints: {},",
      "});",
      "",
    ].join("\n");

    const merged = appendEndpointsToGroup(PATH, existing, GENERATED, ["createPet"]);

    expect(parses(merged)).toBe(true);
    expect(merged.startsWith("\uFEFF")).toBe(true);
    expect(merged).toContain(
      "const { endpoint } = courier();\n\n/** The pets group. */\nexport const pets",
    );
  });

  it("adds nothing an endpoint of the same name is already there for", () => {
    const existing = edited([
      '    createPet: endpoint.post("").body(PetSchema).meta({ mine: true }),',
    ]);

    expect(appendEndpointsToGroup(PATH, existing, GENERATED, ["createPet"])).toBe(existing);
  });

  it("refuses a file that no longer shows its endpoints, rather than guess", () => {
    const reshaped = 'export const pets = makeGroup("/pets");\n';

    expect(() => appendEndpointsToGroup(PATH, reshaped, GENERATED, ["createPet"])).toThrow(
      expect.objectContaining({ code: "FILE_NOT_RECOGNIZED" }),
    );
  });
});
