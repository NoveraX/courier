/**
 * The code Studio writes for an import passes the project's own Biome check
 * — its lint rules, its import order and its formatting — and stays Studio's
 * own: managing the import later finds nothing the user edited.
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

/* The repository's Biome, linked into the project's own node_modules as an installed one is. */
const BIOME_SCOPE = fileURLToPath(new URL("../../../node_modules/@biomejs", import.meta.url));
const BIOME = join(BIOME_SCOPE, "biome", "bin", "biome");

const CONFIG =
  'export default { sources: { api: { baseURL: "https://api.example" } }, imports: { billing: { importType: "file", type: "openapi", outputDir: "src/api", generateClient: "both" } } };\n';
/* A project of its own style: single quotes, 80 columns, the rules this repository lints with. */
const BIOME_CONFIG = JSON.stringify({
  formatter: { indentStyle: "space", lineWidth: 80 },
  javascript: { formatter: { quoteStyle: "single" } },
  linter: {
    rules: {
      preset: "recommended",
      performance: { noReExportAll: "error" },
      style: { useImportType: "error", useExportType: "error" },
    },
  },
  assist: { actions: { source: { organizeImports: "on" } } },
});

const id = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^inv_[a-z0-9/]+$" },
};
const INVOICE = { $ref: "#/components/schemas/Invoice" };
const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: {
      title: "Billing",
      version: "1",
      description: "Invoices and customers.\nWrapped by hand, as Petstore's is.\n\nMore below.",
    },
    paths: {
      "/invoices": {
        get: {
          operationId: "listInvoices",
          tags: ["invoices"],
          responses: ok({ type: "array", items: INVOICE }),
        },
      },
      "/invoices/{id}": {
        get: {
          operationId: "getInvoice",
          tags: ["invoices"],
          parameters: [id],
          responses: ok(INVOICE),
        },
      },
      "/customers": {
        get: {
          operationId: "listCustomers",
          tags: ["customers"],
          responses: ok({ type: "array", items: { type: "string" } }),
        },
      },
    },
    components: {
      schemas: {
        Invoice: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" }, total: { type: "number" } },
        },
      },
    },
  }),
);

function ok(schema: unknown) {
  return { "200": { description: "ok", content: { "application/json": { schema } } } };
}

let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  /* A project of its own, outside the repository: Biome checks nothing under node_modules. */
  root = mkdtempSync(join(tmpdir(), "courier-biome-project-"));
  mkdirSync(join(root, "node_modules"));
  symlinkSync(BIOME_SCOPE, join(root, "node_modules", "@biomejs"));
  writeFileSync(join(root, "package.json"), '{ "name": "billing-app", "private": true }\n');
  writeFileSync(join(root, "courier.config.ts"), CONFIG);
  writeFileSync(join(root, "biome.json"), BIOME_CONFIG);
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function start(): Promise<string> {
  return new Promise((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}

async function post(url: string, path: string, body: unknown) {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url, ...tokenHeader(studio) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function written(): Record<string, string> {
  const dir = join(root, "src/api");
  const files: Record<string, string> = {};
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else files[relative(root, path)] = readFileSync(path, "utf8");
    }
  };
  walk(dir);
  return files;
}

/* The project's own check, as its CI would run it. */
function biomeCheck(): { status: number | null; output: string } {
  const run = spawnSync(process.execPath, [BIOME, "check", "--colors=off", "src/api"], {
    cwd: root,
    encoding: "utf8",
  });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

async function importBilling(url: string, selected: Record<string, string[]>) {
  return post(url, "/api/apis/write", {
    sourceName: "billing",
    spec: SPEC,
    options: {
      type: "openapi",
      outputDir: "src/api",
      sourceName: "billing",
      generateClient: "both",
      selectedEndpoints: selected,
    },
  });
}

describe("the code Studio writes in a project that checks with Biome", () => {
  it("passes the project's check: its rules, its import order and its formatting", async () => {
    const url = await start();

    const result = await importBilling(url, {
      invoices: ["listInvoices", "getInvoice"],
      customers: ["listCustomers"],
    });

    expect(result.body).not.toHaveProperty("error");
    expect(result.status).toBe(200);
    const check = biomeCheck();
    expect(check.output).not.toMatch(/error|×/i);
    expect(check.status).toBe(0);
    const files = Object.values(written()).join("\n");
    expect(files).not.toContain("export *");
    expect(files).not.toContain("new RegExp");
    expect(files).toContain("from '@noverax/courier/define';");
  }, 60_000);

  it("finds nothing edited when the import is managed later, and stays checked", async () => {
    const url = await start();
    await importBilling(url, { invoices: ["listInvoices"], customers: ["listCustomers"] });
    const body = { name: "billing", spec: SPEC, toAdd: { invoices: ["getInvoice"] }, toRemove: {} };

    const preview = await post(url, "/api/apis/manage/preview", body);
    const plan = preview.body.plan as {
      digest: string;
      pending: Array<{ path: string; reason: string }>;
      formatting?: { formattedWith: string[] };
    };
    const applied = await post(url, "/api/apis/manage/apply", {
      ...body,
      planDigest: plan.digest,
      confirm: [],
    });

    expect(plan.pending).toEqual([]);
    expect(plan.formatting?.formattedWith).toEqual([expect.stringMatching(/^Biome /)]);
    expect(applied.status).toBe(200);
    expect(written()["src/api/billing/invoices/index.ts"]).toContain("getInvoice:");
    expect(biomeCheck().status).toBe(0);
  }, 60_000);
});
