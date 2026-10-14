/**
 * The proxy caller is in a module of its own that names the source only as
 * a type, so a browser bundle holds the proxy caller alone — not the
 * source's upstream address, its headers, its schemas or anything else the
 * source module runs — even where every import is kept as written, as
 * `verbatimModuleSyntax` keeps them in a Vite project, and even when the
 * import has a direct caller too.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import {
  compileProject,
  removeProjects,
  routesFiles,
  STRICT,
  writeProject,
} from "../helpers/generated-project";

const SPEC_DOCUMENT = {
  openapi: "3.0.3",
  info: { title: "Shop", version: "1" },
  servers: [{ url: "https://upstream.example/v1" }],
  components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
  security: [{ bearer: [] }],
};

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

const ENTRY = `import { shopProxyApi } from "./src/api/shop/proxy";

export async function load(): Promise<unknown> {
  return shopProxyApi.pets.getPet({ petId: 1 });
}
`;

afterAll(() => {
  removeProjects("generate-index");
});

async function browserBundle(dir: string): Promise<string> {
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
  return result.outputFiles.map((file) => file.text).join("\n");
}

/* The same API with a schema to validate its answer with. */
const WITH_SCHEMA = parseSpec(
  JSON.stringify({
    ...JSON.parse(JSON.stringify(SPEC_DOCUMENT)),
    paths: {
      "/pets/{petId}": {
        get: {
          operationId: "getPet",
          tags: ["pets"],
          parameters: [{ name: "petId", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": {
              description: "ok",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
            },
          },
        },
      },
    },
    components: {
      ...SPEC_DOCUMENT.components,
      schemas: { Pet: { type: "object", properties: { name: { type: "string" } } } },
    },
  }),
);

describe("an import with both callers", () => {
  const files = generateCode(
    WITH_SCHEMA,
    { type: "openapi", outputDir: "src/api", generateClient: "both", addAuthMiddleware: true },
    "shop",
  );
  const dir = writeProject("generate-index/both", [...files, ...routesFiles(files, "shop")], {
    "entry.ts": ENTRY,
  });

  it("keeps the source and the schemas out of a browser bundle of the proxy caller", async () => {
    const bundle = await browserBundle(dir);

    expect(bundle).toContain("createProxyCaller");
    expect(bundle).not.toContain("upstream.example");
    expect(bundle).not.toContain("defineApi");
    expect(bundle).not.toContain("PetSchema");
  });

  it("keeps the direct caller and the schemas in the barrel, and the proxy caller out of it", () => {
    const index = files.find((file) => file.path === "src/api/shop/index.ts")?.content ?? "";
    const proxy = files.find((file) => file.path === "src/api/shop/proxy.ts")?.content ?? "";

    expect(index).toContain("export const shopApi = createCaller(shop);");
    expect(index).toContain("PetSchema");
    expect(index).not.toContain("ProxyApi");
    expect(proxy).toContain('import { shopRoutes } from "../../../courier.routes";');
    expect(proxy).toContain("export const shopProxyApi = createProxyCaller(shopRoutes);");
    expect(proxy).not.toContain("./source");
  });
});

describe("a barrel for proxy mode only", () => {
  const files = generateCode(
    SPEC,
    { type: "openapi", outputDir: "src/api", generateClient: "proxy", addAuthMiddleware: true },
    "shop",
  );
  const dir = writeProject("generate-index/proxy", [...files, ...routesFiles(files, "shop")], {
    "entry.ts": ENTRY,
  });

  it("compiles where every import is kept as written", () => {
    expect(compileProject(dir, ["entry.ts"], { ...STRICT, verbatimModuleSyntax: true })).toEqual(
      [],
    );
  }, 60_000);

  it("leaves the source out of a browser bundle", async () => {
    const bundle = await browserBundle(dir);

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
    expect(
      compileProject(dir, ["src/api/shop/index.ts"], { ...STRICT, noUnusedLocals: true }),
    ).toEqual([]);
  }, 60_000);
});
