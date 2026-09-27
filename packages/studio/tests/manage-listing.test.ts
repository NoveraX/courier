/**
 * An import is listed, and its endpoints picked, as its files hold them:
 * grouped by its `groupBy`, under the names the generator gives them over
 * the whole specification, so an endpoint added later matches what is on
 * disk, and a pick the specification does not generate is caught.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseSync } from "oxc-parser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateCode } from "../src/apis/generator";
import { resolveImportLayout } from "../src/apis/layout";
import { previewAddEndpoints } from "../src/apis/manage";
import { classifyDiskEndpoint } from "../src/apis/manage/classify-endpoint";
import { GroupPrefixChangedError } from "../src/apis/manage/group-prefix-changed-error";
import { listedSelection } from "../src/apis/manage/listed-selection";
import { parseSpec } from "../src/apis/parser";
import { resetProjectRoot, setProjectRoot } from "../src/context";
import { importsSnapshotOf } from "../src/server/imports-bridge";
import { handleInventory } from "../src/server/manage-helpers";
import { projectRootAt } from "../src/server/project-fs/project-root";

const OK = { "200": { description: "ok" } };
/* Both tags have a `getById`: one group holding both renames them after their paths. The tags
   are not the paths' first segments, so grouping by path gives other groups than the tags. */
const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Shop", version: "1" },
    paths: {
      "/pets": { get: { tags: ["animals"], responses: OK } },
      "/pets/{id}": { get: { tags: ["animals"], responses: OK } },
      "/store/{id}": { get: { tags: ["shop"], responses: OK } },
    },
  }),
);
const LAYOUT = resolveImportLayout({ outputDir: "src/api" }, "shop");

function written(groupBy: "single" | "path", selected: Record<string, string[]>): Record<string, string> {
  const options = { type: "openapi" as const, outputDir: "src/api", groupBy, selectedEndpoints: selected };
  return Object.fromEntries(generateCode(SPEC, options, "shop").map((file) => [file.path, file.content]));
}

describe("generating a selection", () => {
  it("names a flat import's endpoint as the whole specification does", () => {
    const source = written("single", { animals: ["getById"] })[LAYOUT.sourceFile];

    expect(source).toContain("getPetsById: endpoint.get(");
    expect(source).not.toMatch(/\bgetById:/);
  });

  it("gives a path group the prefix the whole specification gives it", () => {
    const group = written("path", { animals: ["getAll"] })[LAYOUT.groupFile("pets")];

    expect(group).toContain('prefix: "/pets",');
    expect(group).toContain('getAll: endpoint.get("")');
  });
});

describe("listedSelection", () => {
  it("maps picks from a flat listing to the specification's groups and names", () => {
    expect(listedSelection(SPEC, "single", { api: ["getStoreById", "getPetsById"] })).toEqual({
      selection: { animals: ["getById"], shop: ["getById"] },
      unknown: [],
    });
  });

  it("names every pick the specification does not generate", () => {
    const { unknown } = listedSelection(SPEC, "tag", { nope: ["x"], shop: ["getAll"], animals: ["getAll"] });

    expect(unknown).toEqual(["nope.x", "shop.getAll"]);
  });
});

describe("adding to an import generated from a selection", () => {
  it("appends to a flat import's source the endpoint its listing names", () => {
    const existing = written("single", { animals: ["getById"] });
    const options = { type: "openapi" as const, outputDir: "src/api", groupBy: "single" as const };

    const result = previewAddEndpoints(SPEC, { api: ["getStoreById"] }, options, existing, LAYOUT);

    const source = result.files.find((file) => file.path === LAYOUT.sourceFile)?.content ?? "";
    expect(parseSync("source.ts", source).errors).toEqual([]);
    expect(source).toContain("getPetsById: endpoint.get(");
    expect(source).toContain("getStoreById: endpoint.get(");
  });

  it("appends to a path group an endpoint relative to the prefix it has", () => {
    const existing = written("path", { animals: ["getById"] });
    const options = { type: "openapi" as const, outputDir: "src/api", groupBy: "path" as const };

    const result = previewAddEndpoints(SPEC, { pets: ["getAll"] }, options, existing, LAYOUT);

    const group = result.files.find((file) => file.path === LAYOUT.groupFile("pets"))?.content ?? "";
    expect(group).toContain('prefix: "/pets",');
    expect(group).toContain('getById: endpoint.get(":id")');
    expect(group).toContain('getAll: endpoint.get("")');
    expect(result.sourceFileUpdate).toBeUndefined();
  });
});

describe("the inventory", () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "courier-manage-listing-")));
    setProjectRoot(root);
  });

  afterEach(() => {
    resetProjectRoot();
    rmSync(root, { recursive: true, force: true });
  });

  function inventoryOf(groupBy: "single" | "path", selected: Record<string, string[]>) {
    for (const [path, content] of Object.entries(written(groupBy, selected))) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    const declarations = { shop: { importType: "file" as const, type: "openapi" as const, outputDir: "src/api", groupBy } };
    return handleInventory({ name: "shop", newSpec: SPEC }, importsSnapshotOf(declarations, root), projectRootAt(root));
  }

  it("lists a flat import under the names its source holds", () => {
    expect(inventoryOf("single", { animals: ["getById"] })).toMatchObject({ totalActive: 1, totalAvailable: 2 });
  });

  it("lists an import grouped by path by the groups its files hold", () => {
    const inventory = inventoryOf("path", { animals: ["getById"] });

    expect(inventory).toMatchObject({ totalActive: 1, totalAvailable: 2 });
    expect("groups" in inventory ? inventory.groups.map((group) => group.name) : []).toEqual(["pets", "store"]);
  });
});

describe("names that Object.prototype also has", () => {
  const PROTO = parseSpec(
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Shop", version: "1" },
      paths: {
        "/a": { get: { operationId: "listA", tags: ["toString"], responses: OK } },
        "/b": { get: { operationId: "listB", tags: ["constructor"], responses: OK } },
      },
    }),
  );

  it("generates a selection that leaves out a group named like one", () => {
    const files = generateCode(PROTO, { type: "openapi", outputDir: "src/api", selectedEndpoints: { toString: ["listA"] } }, "shop");

    expect(files.map((file) => file.path)).toContain(LAYOUT.groupFile("toString"));
    expect(files.map((file) => file.path)).not.toContain(LAYOUT.groupFile("constructor"));
  });

  it("maps picks in a group named like one", () => {
    expect(listedSelection(PROTO, "tag", { constructor: ["listB"] })).toEqual({
      selection: { constructor: ["listB"] },
      unknown: [],
    });
  });

  it("lists an endpoint named like one, never generated, as the user's own", () => {
    const endpoint = classifyDiskEndpoint("pets", "constructor", { prefix: "/", endpoints: [] }, {}, { constructor: "h" });

    expect(endpoint.status).toBe("custom");
  });
});

describe("adding to a group the spec now puts under another prefix", () => {
  const customers = {
    "/v1/customers": { get: { operationId: "listCustomers", tags: ["customers"], responses: OK } },
    "/v1/customers/{id}": { get: { operationId: "getCustomer", tags: ["customers"], responses: OK } },
  };
  const spec = (paths: object) => parseSpec(JSON.stringify({ openapi: "3.1.0", info: { title: "Shop", version: "1" }, paths }));
  const V1 = spec(customers);
  const V2 = spec({
    ...customers,
    "/v1/charges": { get: { operationId: "listCharges", tags: ["customers"], responses: OK } },
  });

  it("refuses, rather than write a path relative to a prefix the file does not declare", () => {
    const options = { type: "openapi" as const, outputDir: "src/api" };
    const existing = Object.fromEntries(generateCode(V1, options, "shop").map((file) => [file.path, file.content]));
    expect(existing[LAYOUT.groupFile("customers")]).toContain('prefix: "/v1/customers",');

    expect(() => previewAddEndpoints(V2, { customers: ["listCharges"] }, options, existing, LAYOUT)).toThrow(
      GroupPrefixChangedError,
    );
  });

  it("adds as before while the prefix stays", () => {
    const options = { type: "openapi" as const, outputDir: "src/api" };
    const selected = { customers: ["listCustomers"] };
    const existing = Object.fromEntries(
      generateCode(V1, { ...options, selectedEndpoints: selected }, "shop").map((file) => [file.path, file.content]),
    );

    const result = previewAddEndpoints(V1, { customers: ["getCustomer"] }, options, existing, LAYOUT);

    expect(result.files.find((file) => file.path === LAYOUT.groupFile("customers"))?.content).toContain("getCustomer:");
  });
});
