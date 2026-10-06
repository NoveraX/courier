/**
 * The code Studio generates passes Biome's recommended rules and its import
 * organizer as it is generated, before any formatter runs: a project with
 * no formatter of its own, or one that lints in CI, accepts it unchanged.
 * Tags out of alphabetical order, groups inside groups, endpoints in no
 * group, schemas the groups share and a cycle among them are all here.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type GenerateOptions, generateCode } from "../src/apis/generator";
import { parseSpec } from "../src/apis/parser";

const BIOME = fileURLToPath(
  new URL("../../../node_modules/@biomejs/biome/bin/biome", import.meta.url),
);
const BIOME_CONFIG = JSON.stringify({
  formatter: { enabled: false },
  linter: {
    rules: {
      preset: "recommended",
      performance: { noReExportAll: "error" },
      style: { useImportType: "error", useExportType: "error", noDefaultExport: "error" },
      suspicious: { noExplicitAny: "error" },
    },
  },
  assist: { actions: { source: { organizeImports: "on" } } },
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const ok = (schema: object) => ({
  "200": { description: "ok", content: { "application/json": { schema } } },
});
const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.2.0",
    info: { title: "Shop", version: "1" },
    tags: [{ name: "zoo" }, { name: "billing" }, { name: "invoices", parent: "billing" }],
    paths: {
      "/health": {
        get: {
          operationId: "health",
          parameters: [{ name: "X-Trace", in: "header", schema: { type: "string" } }],
          responses: ok(ref("Status")),
        },
      },
      "/zoo/animals": {
        get: { operationId: "listAnimals", tags: ["zoo"], responses: ok(ref("Animal")) },
      },
      "/billing/invoices": {
        get: { operationId: "listInvoices", tags: ["invoices"], responses: ok(ref("Invoice")) },
      },
      "/billing/summary": {
        get: { operationId: "getSummary", tags: ["billing"], responses: ok(ref("Summary")) },
      },
    },
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
      schemas: {
        Status: { type: "object", properties: { ok: { type: "boolean" } } },
        Node: { type: "object", properties: { next: ref("Node") } },
        Animal: { type: "object", properties: { node: ref("Node"), status: ref("Status") } },
        Invoice: { type: "object", properties: { node: ref("Node") } },
        Summary: { type: "object", properties: { total: { type: "integer" } } },
      },
    },
  }),
);

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-generated-lint-"));
  writeFileSync(join(dir, "biome.json"), BIOME_CONFIG);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("generated code, linted as it is generated", () => {
  it.each([
    ["by tag, zod", { validation: "zod", groupBy: "tag" }],
    ["by path", { validation: "zod", groupBy: "path" }],
    ["in no group", { validation: "zod", groupBy: "single" }],
    ["valibot", { validation: "valibot" }],
    ["arktype", { validation: "arktype" }],
    ["types alone", { validation: "none", generateTypes: true }],
    ["auth and both clients", { addAuthMiddleware: true, generateClient: "both" }],
  ] as const)(
    "passes Biome's rules and import order (%s)",
    (_label, options: Partial<GenerateOptions>) => {
      for (const file of generateCode(
        SPEC,
        { type: "openapi", outputDir: "src", ...options },
        "shop",
      )) {
        mkdirSync(dirname(join(dir, file.path)), { recursive: true });
        writeFileSync(join(dir, file.path), file.content);
      }

      const result = spawnSync(process.execPath, [BIOME, "check", "--colors=off", "src"], {
        cwd: dir,
        encoding: "utf8",
      });

      expect(`${result.stdout}${result.stderr}`).not.toMatch(/×|error/i);
      expect(result.status).toBe(0);
    },
  );
});
