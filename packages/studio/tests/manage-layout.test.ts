/**
 * Managing an import's endpoints reads and writes the files where its layout
 * puts them: the declared output directory's spelling does not decide
 * whether a group file is found, and the inventory finds every group the
 * generator wrote.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateCode } from "../src/apis/generator";
import { InvalidImportError, resolveImportLayout } from "../src/apis/layout";
import { previewAddEndpoints, previewRemoveEndpoints } from "../src/apis/manage";
import { previewRemoveFlatEndpoints } from "../src/apis/manage/remove-flat-endpoints";
import {
  addGroupsToSourceFile,
  removeGroupsFromSourceFile,
} from "../src/apis/manage/update-source-file";
import { parseSpec } from "../src/apis/parser";
import { resetProjectRoot, setProjectRoot } from "../src/context";
import { importsSnapshotOf } from "../src/server/imports-bridge";
import { handleInventory } from "../src/server/manage-helpers";
import { projectRootAt } from "../src/server/project-fs/project-root";

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Shop", version: "1" },
    paths: {
      "/pets": {
        get: { operationId: "listPets", tags: ["pets"], responses: { "200": { description: "ok" } } },
        post: { operationId: "createPet", tags: ["pets"], responses: { "200": { description: "ok" } } },
      },
      "/orders": {
        get: { operationId: "listOrders", tags: ["store"], responses: { "200": { description: "ok" } } },
      },
    },
  }),
);

function filesOf(selected: Record<string, string[]> | null, outputDir = "src/api"): Record<string, string> {
  const files = generateCode(SPEC, { type: "openapi", outputDir, selectedEndpoints: selected }, "shop");
  return Object.fromEntries(files.map((file) => [file.path, file.content]));
}

describe("previewAddEndpoints", () => {
  it("adds to the group file on disk when the output directory is spelled `./src/api/`", () => {
    const existing = filesOf({ pets: ["listPets"] });
    const options = { type: "openapi" as const, outputDir: "./src/api/" };
    const layout = resolveImportLayout(options, "shop");

    const result = previewAddEndpoints(SPEC, { pets: ["createPet"] }, options, existing, layout);

    const group = result.files.find((file) => file.path === "src/api/shop/pets/index.ts");
    expect(group?.action).toBe("modify");
    expect(group?.content).toContain("listPets");
    expect(group?.content).toContain("createPet");
  });

  it("adds a new group to source.ts from its own directory", () => {
    const existing = filesOf({ pets: ["listPets"] });
    const options = { type: "openapi" as const, outputDir: "src/api" };

    const result = previewAddEndpoints(
      SPEC,
      { store: ["listOrders"] },
      options,
      existing,
      resolveImportLayout(options, "shop"),
    );

    expect(result.sourceFileUpdate?.content).toContain('import { store } from "./store/index";');
    expect(result.sourceFileUpdate?.content).toContain("    store,");
  });
});

describe("previewAddEndpoints with schemas two groups share", () => {
  const PET = { $ref: "#/components/schemas/Pet" };
  const ORDER = { $ref: "#/components/schemas/Order" };
  const ok = (schema: object) => ({ "200": { description: "ok", content: { "application/json": { schema } } } });
  const SHARED = parseSpec(
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Shop", version: "1" },
      paths: {
        "/pets": { get: { operationId: "listPets", tags: ["pets"], responses: ok(PET) } },
        "/orders": { get: { operationId: "listOrders", tags: ["store"], responses: ok(ORDER) } },
      },
      components: {
        schemas: {
          Pet: { type: "object", properties: { id: { type: "string" } } },
          Order: { type: "object", properties: { pet: PET } },
        },
      },
    }),
  );

  it("re-exports the added group's schemas by the names the barrel does not export yet", () => {
    const options = { type: "openapi" as const, outputDir: "src/api" };
    const layout = resolveImportLayout(options, "shop");
    const existing = Object.fromEntries(
      generateCode(SHARED, { ...options, selectedEndpoints: { pets: ["listPets"] } }, "shop").map((file) => [
        file.path,
        file.content,
      ]),
    );

    const result = previewAddEndpoints(SHARED, { store: ["listOrders"] }, options, existing, layout);

    const barrel = result.files.find((file) => file.path === layout.indexFile)?.content ?? "";
    expect(barrel).toContain('export * from "./pets/schemas";');
    expect(barrel).not.toContain('export * from "./store/schemas";');
    expect(barrel).toContain('export { type Order, OrderSchema } from "./store/schemas";');
  });

  it("gives the barrel back the shared names when the group whose re-export carried them goes", () => {
    const options = { type: "openapi" as const, outputDir: "src/api" };
    const layout = resolveImportLayout(options, "shop");
    const existing = Object.fromEntries(
      generateCode(SHARED, options, "shop").map((file) => [file.path, file.content]),
    );
    expect(existing[layout.indexFile]).toContain('export * from "./pets/schemas";');

    const result = previewRemoveEndpoints({ pets: ["listPets"] }, existing, {}, layout);

    const barrel = result.indexFileUpdate?.content ?? "";
    expect(barrel).not.toContain("./pets/schemas");
    expect(barrel).toMatch(/export \{ [^}]*\bPetSchema\b[^}]*\} from "\.\/store\/schemas";/);
    expect(barrel).toMatch(/export \{ [^}]*\btype Pet\b[^}]*\} from "\.\/store\/schemas";/);
    expect(barrel).toMatch(/export \{ [^}]*\bOrderSchema\b[^}]*\} from "\.\/store\/schemas";/);
  });
});

describe("previewRemoveEndpoints", () => {
  it("finds the group file where the layout puts it", () => {
    const existing = filesOf(null);
    const layout = resolveImportLayout({ outputDir: "src/api" }, "shop");

    const result = previewRemoveEndpoints({ pets: ["createPet"] }, existing, {}, layout);

    const group = result.modifiedFiles.find((file) => file.path === layout.groupFile("pets"));
    expect(group?.content).toContain("listPets");
    expect(group?.content).not.toContain("createPet");
  });
});

describe("removing the endpoints that used every schema of a group that stays", () => {
  const PET = { $ref: "#/components/schemas/Pet" };
  const ok = (schema?: object) => ({
    "200": { description: "ok", ...(schema && { content: { "application/json": { schema } } }) },
  });
  const PETS = parseSpec(
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Shop", version: "1" },
      paths: {
        "/pets": { get: { operationId: "listPets", tags: ["pets"], responses: ok(PET) } },
        "/ping": { get: { operationId: "ping", tags: ["pets"], responses: ok() } },
      },
      components: { schemas: { Pet: { type: "object", properties: { id: { type: "string" } } } } },
    }),
  );
  const layout = resolveImportLayout({ outputDir: "src/api" }, "shop");
  const written = (groupBy?: "single") =>
    Object.fromEntries(
      generateCode(PETS, { type: "openapi", outputDir: "src/api", ...(groupBy && { groupBy }) }, "shop").map(
        (file) => [file.path, file.content],
      ),
    );

  it("drops the barrel's re-export of the schemas file it deletes", () => {
    const existing = written();
    expect(existing[layout.indexFile]).toContain('export * from "./pets/schemas";');

    const result = previewRemoveEndpoints({ pets: ["listPets"] }, existing, {}, layout);

    expect(result.deletedFiles).toEqual([layout.groupSchemaFile("pets", "schemas")]);
    expect(result.indexFileUpdate?.content).not.toContain("./pets/schemas");
    expect(result.indexFileUpdate?.content).toContain("export const shopApi");
  });

  it("drops a flat import's re-export of the schemas file it deletes", () => {
    const existing = written("single");
    expect(existing[layout.indexFile]).toContain('export * from "./schemas";');

    const result = previewRemoveFlatEndpoints(["listPets"], existing, {}, layout);

    expect(result.deletedFiles).toEqual([layout.schemaFile("schemas")]);
    expect(result.indexFileUpdate?.content).not.toContain("./schemas");
    expect(result.indexFileUpdate?.content).toContain("export const shopApi");
  });
});

describe("previewRemoveEndpoints with a group name that is not a binding", () => {
  it("refuses it rather than take the import's own directory for the group's", () => {
    const existing = filesOf(null);
    const layout = resolveImportLayout({ outputDir: "src/api" }, "shop");

    for (const group of ["", ".", "pets/.."]) {
      expect(() => previewRemoveEndpoints({ [group]: [] }, existing, {}, layout)).toThrow(
        InvalidImportError,
      );
    }
  });
});

describe("source.ts group updates", () => {
  const SOURCE = [
    'import { defineApi } from "@noverax/courier/define";',
    'import { pets as group_pets } from "./pets/index";',
    'import { store } from "./store/index";',
    "",
    "export const pets = defineApi({",
    '  baseURL: "https://api.example",',
    "  groups: {",
    "    pets: group_pets,",
    "    store,",
    "  },",
    "});",
    "",
  ].join("\n");

  it("removes an aliased group's import and entry", () => {
    const updated = removeGroupsFromSourceFile("src/api/petstore/source.ts", SOURCE, ["pets"]);

    expect(updated).not.toContain("group_pets");
    expect(updated).toContain('import { store } from "./store/index";');
    expect(updated).toContain("    store,");
  });

  it("adds a group under an alias when it takes the source's name", () => {
    const withoutPets = removeGroupsFromSourceFile("src/api/petstore/source.ts", SOURCE, ["pets"]);

    const updated = addGroupsToSourceFile("src/api/petstore/source.ts", withoutPets, [
      { name: "pets", local: "group_pets", importPath: "./pets/index" },
    ]);

    expect(updated).toContain('import { pets as group_pets } from "./pets/index";');
    expect(updated).toContain("    pets: group_pets,");
  });
});

describe("handleInventory", () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "courier-manage-layout-")));
    setProjectRoot(root);
  });

  afterEach(() => {
    resetProjectRoot();
    rmSync(root, { recursive: true, force: true });
  });

  it("counts every endpoint the generator wrote as active", () => {
    for (const [path, content] of Object.entries(filesOf(null))) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    const declarations = { shop: { importType: "file" as const, type: "openapi" as const, outputDir: "src/api" } };

    const inventory = handleInventory(
      { name: "shop", newSpec: SPEC },
      importsSnapshotOf(declarations, root),
      projectRootAt(root),
    );

    expect(inventory).toMatchObject({ totalActive: 3, totalAvailable: 0 });
  });

  it("finds a group whose binding carries a type", () => {
    for (const [path, content] of Object.entries(filesOf(null))) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(
        join(root, path),
        content.replace("export const pets = defineGroup(", "export const pets: object = defineGroup("),
      );
    }
    const declarations = { shop: { importType: "file" as const, type: "openapi" as const, outputDir: "src/api" } };

    const inventory = handleInventory(
      { name: "shop", newSpec: SPEC },
      importsSnapshotOf(declarations, root),
      projectRootAt(root),
    );

    expect(inventory).toMatchObject({ totalActive: 3 });
  });
});
