/**
 * OpenAPI 3.2's nested tags, imported as groups inside groups: a tag that
 * names a `parent` is generated in its parent tag's group, its prefix after
 * the parent's, so the generated client reaches each endpoint at the path
 * the specification gives it — checked against a real upstream, the code
 * compiled with every check on. A selection of an inner endpoint keeps the
 * groups it sits in.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { resolveImportLayout } from "../../src/apis/layout";
import { previewAddEndpoints } from "../../src/apis/manage/add-endpoints";
import { previewRemoveEndpoints } from "../../src/apis/manage/remove-endpoints";
import { parseSpec } from "../../src/apis/parser";
import {
  compileProject,
  endpointAt,
  loadGenerated,
  removeProjects,
  STRICT,
  writeProject,
} from "../helpers/generated-project";
import { startUpstreamServer, type UpstreamServer } from "../helpers/upstream-server";

const ok = { "200": { description: "ok" } };
const invoice = { name: "invoice", in: "path", required: true, schema: { type: "string" } };

function spec(origin: string) {
  return parseSpec(
    JSON.stringify({
      openapi: "3.2.0",
      info: { title: "Shop", version: "1" },
      servers: [{ url: `${origin}/v1` }],
      tags: [
        { name: "Billing" },
        { name: "Invoices", parent: "Billing" },
        { name: "Lines", parent: "Invoices" },
        { name: "Loop", parent: "Loop" },
      ],
      paths: {
        "/billing/summary": {
          get: { operationId: "billingSummary", tags: ["Billing"], responses: ok },
        },
        "/billing/invoices": {
          get: { operationId: "listInvoices", tags: ["Invoices"], responses: ok },
        },
        "/billing/invoices/{invoice}/lines": {
          get: { operationId: "listLines", tags: ["Lines"], parameters: [invoice], responses: ok },
        },
        "/loops": { get: { operationId: "listLoops", tags: ["Loop"], responses: ok } },
      },
    }),
  );
}

let upstream: UpstreamServer;

beforeAll(async () => {
  upstream = await startUpstreamServer({});
});

afterAll(async () => {
  await upstream.close();
  removeProjects("nested-tags");
});

function generate(options: Partial<GenerateOptions> = {}) {
  return generateCode(
    spec(upstream.origin),
    { type: "openapi", outputDir: "src/api", ...options },
    "shop",
  );
}

describe("an OpenAPI 3.2 specification with nested tags", () => {
  it("parses each nested tag into a group inside its parent's, a tag under itself left at the top", () => {
    const groups = spec("https://api.example").groups;

    expect(groups.map((g) => [g.name, g.parent, g.prefix])).toEqual([
      ["billing", undefined, "/billing"],
      ["invoices", "billing", "invoices"],
      ["lines", "invoices", ":invoice"],
      ["loop", undefined, "/"],
    ]);
  });

  it("generates a client that reaches every group inside a group at its path", async () => {
    const { shopApi } = loadGenerated(generate(), "src/api/shop/index.ts");
    upstream.requests.length = 0;

    await endpointAt(shopApi, "billing", "billingSummary")();
    await endpointAt(shopApi, "billing", "invoices", "listInvoices")();
    await endpointAt(shopApi, "billing", "invoices", "lines", "listLines")({ invoice: "i7" });

    expect(upstream.requests.map((r) => r.path)).toEqual([
      "/v1/billing/summary",
      "/v1/billing/invoices",
      "/v1/billing/invoices/i7/lines",
    ]);
  });

  it("keeps the groups an inner endpoint sits in when only it is selected", async () => {
    const files = generate({ selectedEndpoints: { lines: ["listLines"] } });
    const { shopApi } = loadGenerated(files, "src/api/shop/index.ts");
    upstream.requests.length = 0;

    await endpointAt(shopApi, "billing", "invoices", "lines", "listLines")({ invoice: "i2" });

    expect(upstream.requests.map((r) => r.path)).toEqual(["/v1/billing/invoices/i2/lines"]);
  });

  it("compiles with every unused name reported", () => {
    const dir = writeProject("nested-tags/zod", generate());
    const strictest = { ...STRICT, noUnusedLocals: true, noUnusedParameters: true };

    expect(compileProject(dir, ["src/api/shop/index.ts"], strictest)).toEqual([]);
  }, 60_000);

  it("takes no builder for a group that only holds groups, so nothing goes unused", () => {
    const files = generate({ selectedEndpoints: { lines: ["listLines"] } });
    const dir = writeProject("nested-tags/outer-only", files);
    const strictest = { ...STRICT, noUnusedLocals: true, noUnusedParameters: true };
    const billing = files.find((file) => file.path === "src/api/shop/billing/index.ts");

    expect(billing?.content).not.toContain("courier()");
    expect(billing?.content).toContain('import { defineGroup } from "@noverax/courier/define";');
    expect(billing?.content).toContain("endpoints: {\n  },");
    expect(compileProject(dir, ["src/api/shop/index.ts"], strictest)).toEqual([]);
  }, 60_000);
});

describe("adding endpoints of nested tags to an import", () => {
  const layout = resolveImportLayout({ outputDir: "src/api" }, "shop");
  const options = { type: "openapi", outputDir: "src/api" } as const;

  /* The import's files with only the endpoints named, then those the add plans. */
  function addTo(written: Record<string, string[]>, adding: Record<string, string[]>) {
    const before = Object.fromEntries(
      generate({ selectedEndpoints: written }).map((file) => [file.path, file.content]),
    );
    const result = previewAddEndpoints(spec(upstream.origin), adding, options, before, layout);
    const after = { ...before };
    for (const file of result.files) after[file.path] = file.content;
    return { result, files: Object.entries(after).map(([path, content]) => ({ path, content })) };
  }

  it("lists a new group in the file of the group it sits in, and leaves the source as it is", async () => {
    const { result, files } = addTo(
      { billing: ["billingSummary"] },
      { invoices: ["listInvoices"] },
    );
    const { shopApi } = loadGenerated(files, "src/api/shop/index.ts");
    upstream.requests.length = 0;

    await endpointAt(shopApi, "billing", "invoices", "listInvoices")();

    expect(result.files.map((file) => file.path)).not.toContain(layout.sourceFile);
    expect(files.find((f) => f.path === layout.groupFile("billing"))?.content).toContain(
      "invoices: invoicesGroup",
    );
    expect(upstream.requests.map((r) => r.path)).toEqual(["/v1/billing/invoices"]);
  });

  it("creates the groups a new inner group sits in, each listed in the one outside it", async () => {
    const { files } = addTo({ billing: ["billingSummary"] }, { lines: ["listLines"] });
    const { shopApi } = loadGenerated(files, "src/api/shop/index.ts");
    upstream.requests.length = 0;

    await endpointAt(shopApi, "billing", "invoices", "lines", "listLines")({ invoice: "i4" });

    expect(upstream.requests.map((r) => r.path)).toEqual(["/v1/billing/invoices/i4/lines"]);
  });
});

describe("removing endpoints of nested tags from an import", () => {
  const layout = resolveImportLayout({ outputDir: "src/api" }, "shop");

  /* The whole import's files, then those the removal leaves. */
  function removeFrom(removing: Record<string, string[]>) {
    const before = Object.fromEntries(generate().map((file) => [file.path, file.content]));
    const result = previewRemoveEndpoints(removing, before, {}, layout);
    const after: Record<string, string> = { ...before };
    for (const file of result.modifiedFiles) after[file.path] = file.content;
    for (const path of result.deletedFiles) delete after[path];
    if (result.indexFileUpdate) after[result.indexFileUpdate.path] = result.indexFileUpdate.content;
    return { result, files: Object.entries(after).map(([path, content]) => ({ path, content })) };
  }

  it("takes a group removed whole out of the group it sits in", async () => {
    const { result, files } = removeFrom({ lines: ["listLines"] });
    const { shopApi } = loadGenerated(files, "src/api/shop/index.ts");
    upstream.requests.length = 0;

    await endpointAt(shopApi, "billing", "invoices", "listInvoices")();

    expect(result.deletedFiles).toContain(layout.groupFile("lines"));
    expect(files.find((f) => f.path === layout.groupFile("invoices"))?.content).not.toContain(
      "lines",
    );
    expect(upstream.requests.map((r) => r.path)).toEqual(["/v1/billing/invoices"]);
  });

  it("keeps a group whose endpoints all go while it holds groups, so they keep a place", async () => {
    const { result, files } = removeFrom({ invoices: ["listInvoices"] });
    const { shopApi } = loadGenerated(files, "src/api/shop/index.ts");
    upstream.requests.length = 0;

    await endpointAt(shopApi, "billing", "invoices", "lines", "listLines")({ invoice: "i9" });

    expect(result.deletedFiles).not.toContain(layout.groupFile("invoices"));
    expect(upstream.requests.map((r) => r.path)).toEqual(["/v1/billing/invoices/i9/lines"]);
  });

  it("removes a group left with nothing in it once the groups inside it go", () => {
    const { result } = removeFrom({ invoices: ["listInvoices"], lines: ["listLines"] });

    expect(result.deletedFiles).toEqual(
      expect.arrayContaining([layout.groupFile("invoices"), layout.groupFile("lines")]),
    );
  });
});
