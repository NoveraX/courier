/**
 * Where the generator writes an import's files. Every path comes from the
 * import's layout, so the directory a declaration names is the directory
 * written, whichever way it is spelled, and two groups never share one.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../src/apis/generator";
import { parseSpec } from "../src/apis/parser";
import type { ParsedSpec } from "../src/apis/parser/types";

/* Inside the repository's node_modules, so the libraries resolve the way
   they do from a user's project. */
const ROOT = fileURLToPath(
  new URL("../../../node_modules/.cache/courier-generated-layout/", import.meta.url),
);

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

function specTagged(tags: string[]): ParsedSpec {
  const paths: Record<string, unknown> = {};
  tags.forEach((tag, index) => {
    paths[`/r${index}`] = {
      get: { operationId: `list${index}`, tags: [tag], responses: { "200": { description: "ok" } } },
    };
  });
  return parseSpec(JSON.stringify({ openapi: "3.1.0", info: { title: "T", version: "1" }, paths }));
}

function pathsOf(spec: ParsedSpec, outputDir: string, importName = "pets"): string[] {
  return generateCode(spec, { type: "openapi", outputDir }, importName).map((file) => file.path);
}

describe("generateCode layout", () => {
  it("writes under the import's key when no sourceName is declared", () => {
    const paths = pathsOf(specTagged(["pets"]), "src/api", "petStore");

    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect(path.startsWith("src/api/pet-store/")).toBe(true);
  });

  it("writes the same paths for every spelling of the output directory", () => {
    const spec = specTagged(["pets", "store"]);

    const canonical = pathsOf(spec, "src/api");

    for (const spelling of ["./src/api/", "src//api", "src\\api"]) {
      expect(pathsOf(spec, spelling)).toEqual(canonical);
    }
  });

  it("keeps groups whose names differ only in case in directories that differ ignoring case", () => {
    const groupFiles = pathsOf(specTagged(["Webhooks", "WebHooks"]), "src/api").filter((path) =>
      /^[^/]+\/index\.ts$/.test(path.slice("src/api/pets/".length)),
    );

    expect(groupFiles).toEqual(["src/api/pets/webhooks/index.ts", "src/api/pets/web-hooks/index.ts"]);
  });

  it("moves a group named like a Windows device into a directory Windows can create", () => {
    expect(pathsOf(specTagged(["Con"]), "src/api")).toContain("src/api/pets/_con/index.ts");
  });

  it("imports a group named like the source under an alias, keeping its key", () => {
    const source = generateCode(specTagged(["Pets"]), { type: "openapi", outputDir: "src/api" }, "pets")
      .find((file) => file.path === "src/api/pets/source.ts");

    expect(source?.content).toContain('import { pets as group_pets } from "./pets/index";');
    expect(source?.content).toContain("    pets: group_pets,");
  });

  it("renames a group named like something the generated files use", () => {
    const paths = pathsOf(specTagged(["Courier", "Endpoint"]), "src/api");

    expect(paths).toContain("src/api/pets/courier-group/index.ts");
    expect(paths).toContain("src/api/pets/endpoint-group/index.ts");
  });

  it.each([
    ["a group named like the source", ["Pets", "Store"], "pets", "tag"],
    ["groups named like what the files use", ["Courier", "Endpoint", "Type"], "pets", "tag"],
    ["a flat import named like what the files use", ["Pets"], "courier", "single"],
  ] as const)("compiles with %s", (label, tags, importName, groupBy) => {
    const files = generateCode(specTagged([...tags]), { type: "openapi", outputDir: "gen", groupBy }, importName);
    const dir = join(ROOT, label.replaceAll(" ", "-"));
    for (const file of files) {
      mkdirSync(dirname(join(dir, file.path)), { recursive: true });
      writeFileSync(join(dir, file.path), file.content);
    }
    const index = files.find((file) => file.path.endsWith("/index.ts") && file.path.split("/").length === 3);
    const program = ts.createProgram([join(dir, index?.path ?? "")], {
      strict: true,
      noEmit: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      skipLibCheck: true,
      types: [],
    });

    const problems = ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));

    expect(index).toBeDefined();
    expect(problems).toEqual([]);
  }, 60_000);
});
