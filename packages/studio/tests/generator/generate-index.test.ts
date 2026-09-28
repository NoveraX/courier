/**
 * A barrel generated for proxy mode only names the source as a type, so a
 * browser bundle holds the proxy caller alone — not the source's upstream
 * address, its headers or anything else the source module runs — even
 * where every import is kept as written, as `verbatimModuleSyntax` keeps
 * them in a Vite project.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { compileProject, removeProjects, STRICT, writeProject } from "../helpers/generated-project";

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Shop", version: "1" },
    servers: [{ url: "https://upstream.example/v1" }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
    security: [{ bearer: [] }],
    paths: {
      "/pets/{petId}": {
        get: {
          operationId: "getPet",
          tags: ["pets"],
          parameters: [{ name: "petId", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "ok" } },
        },
      },
    },
  }),
);

const ENTRY = `import { shopProxyApi } from "./src/api/shop";

export async function load(): Promise<unknown> {
  return shopProxyApi.pets.getPet({ petId: 1 });
}
`;

afterAll(() => {
  removeProjects("generate-index");
});

describe("a barrel for proxy mode only", () => {
  const files = generateCode(
    SPEC,
    { type: "openapi", outputDir: "src/api", generateClient: "proxy", addAuthMiddleware: true },
    "shop",
  );
  const dir = writeProject("generate-index/proxy", files, { "entry.ts": ENTRY });

  it("compiles where every import is kept as written", () => {
    expect(compileProject(dir, ["entry.ts"], { ...STRICT, verbatimModuleSyntax: true })).toEqual([]);
  }, 60_000);

  it("leaves the source out of a browser bundle", async () => {
    const tsconfig = join(dir, "tsconfig.json");
    writeFileSync(tsconfig, JSON.stringify({ compilerOptions: { verbatimModuleSyntax: true } }));

    const result = await build({
      entryPoints: [join(dir, "entry.ts")],
      bundle: true,
      format: "esm",
      platform: "browser",
      write: false,
      tsconfig,
      external: ["@noverax/courier", "@noverax/courier/*", "zod"],
    });
    const bundle = result.outputFiles.map((file) => file.text).join("\n");

    expect(bundle).toContain("createProxyCaller");
    expect(bundle).not.toContain("upstream.example");
    expect(bundle).not.toContain("defineApi");
  });
});

describe("a barrel generated with no caller", () => {
  const files = generateCode(
    SPEC,
    { type: "openapi", outputDir: "src/api", generateClient: "none" },
    "shop",
  );
  const dir = writeProject("generate-index/none", files);

  it("imports nothing it does not read", () => {
    const index = files.find((file) => file.path === "src/api/shop/index.ts")?.content ?? "";

    expect(index).not.toContain("./source");
    expect(compileProject(dir, ["src/api/shop/index.ts"], { ...STRICT, noUnusedLocals: true })).toEqual([]);
  }, 60_000);
});
