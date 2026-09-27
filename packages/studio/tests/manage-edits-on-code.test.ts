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
import { appendBarrelExports } from "../src/apis/manage/append-barrel-exports";
import { buildEndpointInventory } from "../src/apis/manage/build-inventory";
import { parseSpec } from "../src/apis/parser/parse-spec";
import { previewRemoveEndpoints } from "../src/apis/manage/remove-endpoints";
import { removeBarrelExports } from "../src/apis/manage/remove-barrel-exports";
import { removeEndpointsFromFile } from "../src/apis/manage/remove-endpoints-from-file";
import { addGroupsToSourceFile, removeGroupsFromSourceFile } from "../src/apis/manage/update-source-file";
import { generateFingerprints } from "../src/apis/merge/fingerprint";

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
    const { content, removedCode } = removeEndpointsFromFile("src/api/pets/pets/index.ts", GROUP, ["createPet"]);

    expect(content).not.toBeNull();
    expect(parses(content ?? "")).toBe(true);
    expect(content).toContain("const { endpoint } = courier();");
    expect(content).toContain("function withCache<T>(value: T): T {");
    expect(content).toContain('import { courier, defineGroup } from "@noverax/courier/define";');
    expect(content).toContain('import { PetSchema } from "./schemas";');
    expect(content).toContain('    /** List the pets. */\n    listPets: endpoint.get("").response(PetSchema),\n    deletePet');
    expect(content).not.toContain("Create a pet");
    expect(removedCode).toEqual(['createPet: endpoint.post("").variables(NewPetSchema)']);
  });

  it("gives the file up only when no entry is left in its endpoints", () => {
    const all = removeEndpointsFromFile("src/api/pets/pets/index.ts", GROUP, ["listPets", "createPet", "deletePet"]);

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

describe("the barrel", () => {
  it("drops and adds re-exports whatever quotes they are written with", () => {
    const barrel = "export * from './users/schemas';\nexport * from './pets/schemas';\n";

    const dropped = removeBarrelExports("src/api/pets/index.ts", barrel, new Set(["./users/schemas"]));
    const added = appendBarrelExports(
      "src/api/pets/index.ts",
      dropped,
      'export * from "./users/schemas";\nexport * from "./pets/schemas";\n',
      () => undefined,
    );

    expect(dropped).toBe("export * from './pets/schemas';\n");
    expect(added).toBe("export * from './pets/schemas';\nexport * from \"./users/schemas\";\n");
  });
});

describe("the barrel, adding a group whose schemas share names with one already there", () => {
  const MODULES: Record<string, string> = {
    "src/api/shop/pets/schemas.ts": "export const PetSchema = z.object({});\nexport type Pet = z.infer<typeof PetSchema>;\n",
    "src/api/shop/store/schemas.ts":
      "export const PetSchema = z.object({});\nexport type Pet = z.infer<typeof PetSchema>;\nexport const OrderSchema = z.object({});\nexport type Order = z.infer<typeof OrderSchema>;\n",
    "src/api/shop/tags/schemas.ts": "export const PetSchema = z.object({});\nexport type Pet = z.infer<typeof PetSchema>;\n",
  };
  const textOf = (path: string): string | undefined => MODULES[path];

  it("re-exports only the names no module re-exported before exports", () => {
    const added = appendBarrelExports(
      "src/api/shop/index.ts",
      'export * from "./pets/schemas";\n',
      'export * from "./store/schemas";\n',
      textOf,
    );

    expect(added).toBe(
      'export * from "./pets/schemas";\nexport { OrderSchema, type Order } from "./store/schemas";\n',
    );
  });

  it("adds nothing for a module every name of which the barrel already exports", () => {
    const barrel = 'export * from "./pets/schemas";\n';

    expect(appendBarrelExports("src/api/shop/index.ts", barrel, 'export * from "./tags/schemas";\n', textOf)).toBe(
      barrel,
    );
  });

  it("counts a name listed by an earlier re-export, and one of the groups being added", () => {
    const added = appendBarrelExports(
      "src/api/shop/index.ts",
      'export { PetSchema, type Pet } from "./pets/schemas";\n',
      'export * from "./tags/schemas";\nexport * from "./store/schemas";\n',
      textOf,
    );

    expect(added).toBe(
      'export { PetSchema, type Pet } from "./pets/schemas";\nexport { OrderSchema, type Order } from "./store/schemas";\n',
    );
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
    const files = { [layout.groupFile("pets")]: GROUP, [layout.groupSchemaFile("pets", "schemas")]: schemas };

    const result = previewRemoveEndpoints({ pets: ["createPet"] }, files, {}, layout);

    expect(result.orphanedSchemas).toEqual(["NewPetSchema"]);
    expect(result.modifiedFiles.find((f) => f.path.endsWith("schemas.ts"))?.content).toContain("MyOwnSchema");
  });

  it("warns about an edited endpoint by its own group, never one of the same name elsewhere", () => {
    const store = GROUP.replace("export const pets", "export const store").replace('"/pets"', '"/store"');
    const edited = store.replace('endpoint.delete("/{id}")', 'endpoint.delete("/{id}").meta({ mine: true })');
    const files = { [layout.groupFile("pets")]: GROUP, [layout.groupFile("store")]: edited };
    const fingerprints = { [layout.groupFile("pets")]: generateFingerprints(GROUP), [layout.groupFile("store")]: generateFingerprints(store) };

    const pets = previewRemoveEndpoints({ pets: ["deletePet"] }, files, fingerprints, layout);
    const storeRemoval = previewRemoveEndpoints({ store: ["deletePet"] }, files, fingerprints, layout);

    expect(pets.modifiedEndpointsWarning).toEqual([]);
    expect(storeRemoval.modifiedEndpointsWarning).toEqual(["store.deletePet"]);
  });
});

describe("the endpoint inventory", () => {
  it("marks as edited only the endpoint whose own group's file changed, among endpoints of one name", () => {
    const layout = resolveImportLayout({ outputDir: "src/api" }, "pets");
    const store = GROUP.replace("export const pets", "export const store").replace('"/pets"', '"/store"');
    const edited = store.replace('endpoint.delete("/{id}")', 'endpoint.delete("/{id}").meta({ mine: true })');
    const petsFile = layout.groupFile("pets");
    const storeFile = layout.groupFile("store");
    const operation = (id: string, tag: string) => ({ operationId: id, tags: [tag], responses: { "200": { description: "ok" } } });
    const spec = parseSpec(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Pets", version: "1" },
        paths: { "/pets/{id}": { delete: operation("deletePet", "pets") }, "/store/{id}": { delete: operation("deletePet", "store") } },
      }),
    );
    const disk = (file: string) => ({ prefix: "", endpoints: ["listPets", "createPet", "deletePet"], file });

    const inventory = buildEndpointInventory(
      spec,
      [{ name: "pets", ...disk(petsFile) }, { name: "store", ...disk(storeFile) }],
      { [petsFile]: generateFingerprints(GROUP), [storeFile]: generateFingerprints(store) },
      { [petsFile]: GROUP, [storeFile]: edited },
    );

    const status = (group: string) =>
      inventory.groups.find((g) => g.name === group)?.endpoints.find((e) => e.name === "deletePet")?.modificationStatus;
    expect(status("pets")).toBe("safe");
    expect(status("store")).toBe("modified");
  });
});
