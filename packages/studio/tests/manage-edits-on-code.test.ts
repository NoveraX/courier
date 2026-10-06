/**
 * Managing an import's endpoints edits its files as code: removing some
 * endpoints of a group keeps everything else the file says, groups come
 * and go from source.ts however its imports are wrapped or its lines end,
 * the barrel is read whatever quotes it uses, a schema the user added
 * stays, and an edited endpoint is named by its own group.
 */
import { parseSync } from "oxc-parser";
import { describe, expect, it } from "vitest";

import { resolveImportLayout } from "../src/apis/layout";
import { buildEndpointInventory } from "../src/apis/manage/build-inventory";
import { detectOrphanSchemas } from "../src/apis/manage/detect-orphan-schemas";
import { rebuildBarrel } from "../src/apis/manage/rebuild-barrel";
import { previewRemoveEndpoints } from "../src/apis/manage/remove-endpoints";
import { removeEndpointsFromFile } from "../src/apis/manage/remove-endpoints-from-file";
import { removeOrphanSchemas } from "../src/apis/manage/remove-schemas";
import {
  addGroupsToSourceFile,
  removeGroupsFromSourceFile,
} from "../src/apis/manage/update-source-file";
import { generateFingerprints } from "../src/apis/merge/fingerprint";
import { parseSpec } from "../src/apis/parser/parse-spec";

const GROUP = [
  'import { courier, defineGroup } from "@noverax/courier/define";',
  'import { PetSchema, NewPetSchema } from "./schemas";',
  "",
  "const { endpoint } = courier();",
  "",
  "function withCache<T>(value: T): T {",
  "  return value;",
  "}",
  "",
  "export const pets = defineGroup({",
  '  prefix: "/pets",',
  "  endpoints: {",
  "    /** List the pets. */",
  '    listPets: endpoint.get("").response(PetSchema),',
  "    /** Create a pet. */",
  '    createPet: endpoint.post("").variables(NewPetSchema),',
  '    deletePet: endpoint.delete("/{id}"),',
  "  },",
  "});",
  "",
].join("\n");

function parses(code: string): boolean {
  return parseSync("index.ts", code).errors.length === 0;
}

describe("removing some endpoints of a group", () => {
  it("keeps the base, the user's code and the other endpoints, and drops only imports nothing uses now", () => {
    const { content, removedCode } = removeEndpointsFromFile("src/api/pets/pets/index.ts", GROUP, [
      "createPet",
    ]);

    expect(content).not.toBeNull();
    expect(parses(content ?? "")).toBe(true);
    expect(content).toContain("const { endpoint } = courier();");
    expect(content).toContain("function withCache<T>(value: T): T {");
    expect(content).toContain('import { courier, defineGroup } from "@noverax/courier/define";');
    expect(content).toContain('import { PetSchema } from "./schemas";');
    expect(content).toContain(
      '    /** List the pets. */\n    listPets: endpoint.get("").response(PetSchema),\n    deletePet',
    );
    expect(content).not.toContain("Create a pet");
    expect(removedCode).toEqual(['createPet: endpoint.post("").variables(NewPetSchema)']);
  });

  it("gives the file up only when no entry is left in its endpoints", () => {
    const all = removeEndpointsFromFile("src/api/pets/pets/index.ts", GROUP, [
      "listPets",
      "createPet",
      "deletePet",
    ]);

    expect(all.content).toBeNull();
  });
});

const SOURCE = [
  "import { defineApi } from '@noverax/courier/define';",
  "import {",
  "  pets as group_pets,",
  "} from './pets/index';",
  "import { store } from './store/index';",
  "",
  "export const petStore = defineApi({",
  "  baseURL: 'https://pets.example',",
  "  groups: {",
  "    pets: group_pets,",
  "    store,",
  "  },",
  "});",
  "",
].join("\r\n");

describe("groups in a source file", () => {
  it("adds a group after an import a formatter wrapped, in the file's quotes and line endings", () => {
    const updated = addGroupsToSourceFile("src/api/pet-store/source.ts", SOURCE, [
      { name: "users", local: "users", importPath: "./users/index" },
    ]);

    expect(parses(updated)).toBe(true);
    expect(updated).toContain("import { users } from './users/index';\r\n");
    expect(updated).toContain("    store,\r\n    users,\r\n  },");
  });

  it("removes a group with CRLF lines and a wrapped import, leaving the rest", () => {
    const updated = removeGroupsFromSourceFile("src/api/pet-store/source.ts", SOURCE, ["pets"]);

    expect(parses(updated)).toBe(true);
    expect(updated).not.toContain("group_pets");
    expect(updated).toContain("import { store } from './store/index';\r\n");
    expect(updated).toContain("    store,\r\n  },");
  });
});

describe("rebuildBarrel", () => {
  const layout = resolveImportLayout({ outputDir: "src/api" }, "shop");
  const SOURCE = [
    'import { defineApi } from "@noverax/courier/define";',
    'import { alpha } from "./alpha/index";',
    'import { gamma } from "./gamma/index";',
    'import { misc } from "./misc/index";',
    "",
    'export const shop = defineApi({ baseURL: "/", groups: { alpha, gamma, misc } });',
    "",
  ].join("\n");
  const HEAD =
    'import { createCaller } from "@noverax/courier";\nimport { shop } from "./source";\n\nexport const shopApi = createCaller(shop);\n\n';
  const schema = (...names: string[]) =>
    names
      .map((n) => `export type ${n} = { id?: string };\nexport const ${n}Schema = z.object({});\n`)
      .join("");
  const files = (barrel: string, modules: Record<string, string>) => ({
    [layout.sourceFile]: SOURCE,
    [layout.indexFile]: barrel,
    ...Object.fromEntries(
      Object.entries(modules).map(([dir, text]) => [`src/api/shop/${dir}.ts`, text]),
    ),
  });

  it("re-exports each module by the names no earlier one exports, in the order of the groups", () => {
    const barrel = rebuildBarrel(
      layout,
      files(HEAD, {
        "alpha/schemas": schema("A", "Pet"),
        "gamma/schemas": schema("Pet", "Order"),
        "misc/schemas": schema("Order"),
      }),
      false,
    );

    expect(barrel).toBe(
      `${HEAD}export { type A, ASchema, type Pet, PetSchema } from "./alpha/schemas";\nexport { type Order, OrderSchema } from "./gamma/schemas";\n`,
    );
  });

  it("writes the lines again in place, whatever quotes they had, dropping those of modules gone", () => {
    const old = `${HEAD}export * from './users/schemas';\nexport * from './alpha/schemas';\n// mine\nexport const extra = 1;\n`;

    const barrel = rebuildBarrel(layout, files(old, { "alpha/schemas": schema("A") }), false);

    expect(barrel).toBe(
      `${HEAD}export { type A, ASchema } from "./alpha/schemas";\n// mine\nexport const extra = 1;\n`,
    );
  });

  it("gives a module's list the names it gained, and a module another loses a name to its line back", () => {
    const old = `${HEAD}export * from "./alpha/schemas";\nexport { OrderSchema, type Order } from "./gamma/schemas";\n`;

    const grown = rebuildBarrel(
      layout,
      files(old, {
        "alpha/schemas": schema("Pet"),
        "gamma/schemas": schema("Pet", "Order", "Fresh"),
      }),
      false,
    );
    const shrunk = rebuildBarrel(
      layout,
      files(old, { "alpha/schemas": schema("A"), "gamma/schemas": schema("Pet", "Order") }),
      false,
    );

    expect(grown).toContain(
      'export {\n  type Order,\n  OrderSchema,\n  type Fresh,\n  FreshSchema,\n} from "./gamma/schemas";',
    );
    expect(shrunk).toContain(
      'export { type Pet, PetSchema, type Order, OrderSchema } from "./gamma/schemas";',
    );
  });

  it("keeps a line the user wrote, and counts its names", () => {
    const old = `${HEAD}export * from "./alpha/schemas";\nexport type { Order } from "./gamma/schemas";\nexport { PetSchema as MyPet } from "./gamma/schemas";\nexport * from "./extras/types";\n`;
    const modules = {
      "alpha/schemas": schema("A"),
      "gamma/schemas": schema("Order", "Pet"),
      "extras/types": "export type A = { custom: true };\n",
    };

    const barrel = rebuildBarrel(layout, files(old, modules), false) ?? "";

    expect(barrel).toContain('export type { Order } from "./gamma/schemas";');
    expect(barrel).toContain('export { PetSchema as MyPet } from "./gamma/schemas";');
    expect(barrel).toContain('export * from "./extras/types";');
    expect(barrel).toContain('export { OrderSchema, type Pet, PetSchema } from "./gamma/schemas";');
    expect(barrel).not.toContain('export * from "./alpha/schemas";');
    expect(barrel).toContain('export { ASchema } from "./alpha/schemas";');
  });

  it("re-exports a flat import's schemas file again once it is back", () => {
    const flat = { ...files(HEAD, { schemas: schema("X") }) };
    delete flat[layout.sourceFile];

    expect(rebuildBarrel(layout, flat, true)).toBe(
      `${HEAD}export { type X, XSchema } from "./schemas";\n`,
    );
  });
});

describe("detectOrphanSchemas", () => {
  const PARAMS = [
    "export type FindParams = { status: string };",
    "export const FindParamsSchema = z.object({ status: z.string() }) satisfies z.ZodType<FindParams>;",
    "",
  ].join("\n");

  it("drops a type and the schema written for it together, whichever of them the endpoint used", () => {
    expect(detectOrphanSchemas(PARAMS, "", ["find: endpoint.get<FindParams>('/find')"])).toEqual([
      "FindParams",
      "FindParamsSchema",
    ]);
    expect(
      detectOrphanSchemas(PARAMS, "", ["find: endpoint.get('/find').query(FindParamsSchema)"]),
    ).toEqual(["FindParams", "FindParamsSchema"]);
  });

  it("keeps a type a schema of the user's that stays is written with", () => {
    const schemas = `${PARAMS}export const MineSchema = z.object({}) satisfies z.ZodType<FindParams>;\n`;

    expect(detectOrphanSchemas(schemas, "", ["find: endpoint.get<FindParams>('/find')"])).toEqual(
      [],
    );
  });

  it("keeps an enum's type while an endpoint left uses its schema", () => {
    const schemas = [
      'export const StatusSchema = z.enum(["a", "b"]);',
      "export type Status = z.infer<typeof StatusSchema>;",
      "export type Order = { status?: Status };",
      "export const OrderSchema = z.object({ status: StatusSchema.optional() }) satisfies z.ZodType<Order>;",
      "",
    ].join("\n");
    const remaining =
      "export const g = defineGroup({ endpoints: { s: endpoint.get('s').response(StatusSchema) } });";

    expect(
      detectOrphanSchemas(schemas, remaining, ["o: endpoint.get('o').response(OrderSchema)"]),
    ).toEqual(["Order", "OrderSchema"]);
  });

  it("counts an endpoint whose name starts with import as code that uses schemas", () => {
    const schemas =
      "export type Pet = { name?: string };\nexport const PetSchema = z.object({}) satisfies z.ZodType<Pet>;\n";
    const remaining = [
      'import { PetSchema } from "./schemas";',
      "export const pets = defineGroup({",
      "  endpoints: {",
      '    importPets: endpoint.post("import").variables(PetSchema).response(PetSchema),',
      "  },",
      "});",
    ].join("\n");

    expect(
      detectOrphanSchemas(schemas, remaining, ['getPet: endpoint.get(":id").response(PetSchema)']),
    ).toEqual([]);
  });

  it("is not thrown off by a bracket in a description", () => {
    const schemas = [
      "export type Txn = {",
      "  /** Its id (see the docs */",
      "  id?: string;",
      "};",
      "",
      "export const TxnSchema = z.object({ id: z.string().optional() }) satisfies z.ZodType<Txn>;",
      "",
      "export type Auth = { id?: string };",
      "export const AuthSchema = z.object({ id: z.string().optional() }) satisfies z.ZodType<Auth>;",
      "",
    ].join("\n");
    const remaining =
      "export const g = defineGroup({ endpoints: { t: endpoint.get('t').response(TxnSchema) } });";

    const orphans = detectOrphanSchemas(schemas, remaining, [
      "a: endpoint.get('a').response(AuthSchema)",
    ]);
    const cleaned = removeOrphanSchemas(schemas, orphans);

    expect(orphans).toEqual(["Auth", "AuthSchema"]);
    expect(cleaned).toContain("export const TxnSchema");
    expect(cleaned).toContain("/** Its id (see the docs */");
    expect(cleaned).not.toContain("Auth");
  });

  it("removes nothing when the endpoints left do not parse", () => {
    expect(
      detectOrphanSchemas(PARAMS, "export const = ;", ["find: endpoint.get<FindParams>('/find')"]),
    ).toEqual([]);
  });
});

describe("removeOrphanSchemas", () => {
  const CYCLIC = [
    'import { type } from "arktype";',
    'import type * as ark from "arktype";',
    "",
    "/* Set by the last line of this file. */",
    "let declared = false;",
    "",
    "/** Refer to a schema on the same reference cycle, read only while validating. */",
    "function lazy(base: ark.Type, resolve: () => (value: unknown) => unknown) {",
    "  return base.narrow(() => declared && resolve() !== undefined);",
    "}",
    "",
    'export const PetSchema = type({ name: "string" });',
    "",
    'export const NodeSchema: ark.Type<unknown> = type({ next: lazy(type("object"), () => NodeSchema) });',
    "",
    "declared = true;",
    "",
  ].join("\n");

  it("takes away ArkType's cycle helper and its import with the last schema on a cycle", () => {
    const cleaned = removeOrphanSchemas(CYCLIC, ["NodeSchema"]) ?? "";

    expect(cleaned).toContain("export const PetSchema");
    expect(cleaned).not.toMatch(/lazy|declared|ark\b/);
    expect(cleaned).toContain('import { type } from "arktype";');
  });

  it("keeps the helper while a schema on a cycle stays", () => {
    const cleaned = removeOrphanSchemas(CYCLIC, ["PetSchema"]) ?? "";

    expect(cleaned).toContain("function lazy(");
    expect(cleaned).toContain("let declared = false;");
    expect(cleaned).toContain("declared = true;");
    expect(cleaned).not.toContain("PetSchema");
  });

  it("gives null when no declaration is left", () => {
    expect(removeOrphanSchemas(CYCLIC, ["PetSchema", "NodeSchema"])).toBeNull();
  });
});

describe("removing endpoints, as manage previews it", () => {
  const layout = resolveImportLayout({ outputDir: "src/api" }, "pets");
  const schemas = [
    'import { z } from "zod";',
    "export const PetSchema = z.object({ id: z.string() });",
    "export const NewPetSchema = z.object({ name: z.string() });",
    "export const MyOwnSchema = z.object({ note: z.string() });",
    "",
  ].join("\n");

  it("removes the schemas only the removed endpoints used, and keeps one the user added", () => {
    const files = {
      [layout.groupFile("pets")]: GROUP,
      [layout.groupSchemaFile("pets", "schemas")]: schemas,
    };

    const result = previewRemoveEndpoints({ pets: ["createPet"] }, files, {}, layout);

    expect(result.orphanedSchemas).toEqual(["NewPetSchema"]);
    expect(result.modifiedFiles.find((f) => f.path.endsWith("schemas.ts"))?.content).toContain(
      "MyOwnSchema",
    );
  });

  it("warns about an edited endpoint by its own group, never one of the same name elsewhere", () => {
    const store = GROUP.replace("export const pets", "export const store").replace(
      '"/pets"',
      '"/store"',
    );
    const edited = store.replace(
      'endpoint.delete("/{id}")',
      'endpoint.delete("/{id}").meta({ mine: true })',
    );
    const files = { [layout.groupFile("pets")]: GROUP, [layout.groupFile("store")]: edited };
    const fingerprints = {
      [layout.groupFile("pets")]: generateFingerprints(GROUP),
      [layout.groupFile("store")]: generateFingerprints(store),
    };

    const pets = previewRemoveEndpoints({ pets: ["deletePet"] }, files, fingerprints, layout);
    const storeRemoval = previewRemoveEndpoints(
      { store: ["deletePet"] },
      files,
      fingerprints,
      layout,
    );

    expect(pets.modifiedEndpointsWarning).toEqual([]);
    expect(storeRemoval.modifiedEndpointsWarning).toEqual(["store.deletePet"]);
  });
});

describe("the endpoint inventory", () => {
  it("marks as edited only the endpoint whose own group's file changed, among endpoints of one name", () => {
    const layout = resolveImportLayout({ outputDir: "src/api" }, "pets");
    const store = GROUP.replace("export const pets", "export const store").replace(
      '"/pets"',
      '"/store"',
    );
    const edited = store.replace(
      'endpoint.delete("/{id}")',
      'endpoint.delete("/{id}").meta({ mine: true })',
    );
    const petsFile = layout.groupFile("pets");
    const storeFile = layout.groupFile("store");
    const operation = (id: string, tag: string) => ({
      operationId: id,
      tags: [tag],
      responses: { "200": { description: "ok" } },
    });
    const spec = parseSpec(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Pets", version: "1" },
        paths: {
          "/pets/{id}": { delete: operation("deletePet", "pets") },
          "/store/{id}": { delete: operation("deletePet", "store") },
        },
      }),
    );
    const disk = (file: string) => ({
      prefix: "",
      endpoints: ["listPets", "createPet", "deletePet"],
      file,
    });

    const inventory = buildEndpointInventory(
      spec,
      [
        { name: "pets", ...disk(petsFile) },
        { name: "store", ...disk(storeFile) },
      ],
      { [petsFile]: generateFingerprints(GROUP), [storeFile]: generateFingerprints(store) },
      { [petsFile]: GROUP, [storeFile]: edited },
    );

    const status = (group: string) =>
      inventory.groups.find((g) => g.name === group)?.endpoints.find((e) => e.name === "deletePet")
        ?.modificationStatus;
    expect(status("pets")).toBe("safe");
    expect(status("store")).toBe("modified");
  });
});
