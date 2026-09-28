/**
 * In a project whose ES modules TypeScript resolves as Node does, a relative
 * import has to name the file it loads, `./pets/index.js`. The generated
 * files follow the project: they carry the extension there — and so does
 * what adding endpoints later writes into them — and nowhere else.
 */
import { realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { resolveImportLayout } from "../../src/apis/layout";
import { rebuildBarrel } from "../../src/apis/manage/rebuild-barrel";
import { sourceWithNewGroups } from "../../src/apis/manage/source-with-new-groups";
import { parseSpec } from "../../src/apis/parser";
import { loadCourierConfig } from "../../src/server/config-loader";
import { describeImportDeclaration } from "../../src/server/describe-import-declaration";
import {
  generatedImportExtension,
  withImportExtension,
} from "../../src/server/generated-import-extension";
import { compileProject, removeProjects, STRICT, writeProject } from "../helpers/generated-project";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Pets", version: "1" },
    servers: [{ url: "https://pets.test" }],
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          tags: ["pets"],
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer" } },
            { name: "kind", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "ok", content: { "application/json": { schema: ref("Pet") } } } },
        },
      },
      "/store": {
        get: { operationId: "inventory", tags: ["store"], responses: { "200": { description: "ok" } } },
      },
    },
    components: { schemas: { Pet: { type: "object", properties: { name: { type: "string" } } } } },
  }),
);

const NODE_NEXT: ts.CompilerOptions = {
  ...STRICT,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
};

/** A project of the given kind, with nothing generated in it yet. */
function project(label: string, packageType: string | null, module: string): string {
  const dir = writeProject(`import-extension/${label}`, [], {
    "tsconfig.json": JSON.stringify({ compilerOptions: { module, moduleResolution: module } }),
  });
  const manifest = packageType === null ? {} : { type: packageType };
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest));
  return dir;
}

afterAll(() => {
  removeProjects("import-extension");
});

describe("the extension generated imports carry", () => {
  it("is .js in an ES module project resolving as Node does", () => {
    const layout = resolveImportLayout({ outputDir: "src/api" }, "pets");

    expect(generatedImportExtension(project("esm", "module", "NodeNext"), layout)).toBe(".js");
    expect(generatedImportExtension(project("cjs", null, "NodeNext"), layout)).toBeUndefined();
    expect(generatedImportExtension(project("bundler", "module", "ESNext"), layout)).toBeUndefined();
  });

  it.each(["tag", "single"] as const)("lets the files compile there, grouped by %s", (groupBy) => {
    const root = project(`compile-${groupBy}`, "module", "NodeNext");
    const options = withImportExtension(
      { type: "openapi", outputDir: "src/api", sourceName: "pets", groupBy, generateClient: "both" },
      root,
    );
    const consumer = `import { petsApi } from "./src/api/pets/index.js";\nexport const pets = petsApi;\n`;
    writeProject(`import-extension/compile-${groupBy}`, generateCode(SPEC, options), {
      "consumer.ts": consumer,
      "tsconfig.json": JSON.stringify({ compilerOptions: { module: "NodeNext" } }),
      "package.json": JSON.stringify({ type: "module" }),
    });

    expect(options.importExtension).toBe(".js");
    expect(compileProject(root, ["consumer.ts"], NODE_NEXT)).toEqual([]);
  }, 60_000);
});

describe("the config import Studio asks for", () => {
  it("names the source with the extension where the config needs it", async () => {
    const root = project("declare", "module", "NodeNext");
    writeFileSync(
      join(root, "courier.config.ts"),
      'import { defineConfig } from "@noverax/courier/config";\nexport default defineConfig({ sources: {} });\n',
    );
    const loaded = await loadCourierConfig(root);
    const options = { type: "openapi" as const, outputDir: "src/api", sourceName: "pets" };

    const declaration = describeImportDeclaration({
      name: "pets",
      body: { sourceName: "pets", spec: SPEC, options, importType: "raw" },
      loaded,
      root: realpathSync(root),
    });

    expect(declaration?.source?.importLine).toBe('import { pets } from "./src/api/pets/source.js";');
  });
});

describe("adding endpoints to an import whose files carry the extension", () => {
  const layout = resolveImportLayout({ outputDir: "src/api" }, "pets");
  const files = Object.fromEntries(
    generateCode(SPEC, { type: "openapi", outputDir: "src/api", importExtension: ".js" }, "pets").map(
      (file) => [file.path, file.content],
    ),
  );

  it("imports a new group's file with it", () => {
    const update = sourceWithNewGroups({ orders: ["listOrders"] }, { groupBy: "tag" }, files, layout);

    expect(update?.content).toContain('from "./orders/index.js"');
  });

  it("keeps it on the barrel's re-exports", () => {
    const barrel = rebuildBarrel(layout, files, false) ?? "";

    expect(barrel).toContain('export * from "./pets/schemas.js";');
    expect(barrel).not.toMatch(/from "\.\/pets\/schemas";/);
  });
});
