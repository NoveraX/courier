/**
 * The source catalogue marks a source imported only when the config loaded
 * the source Studio generated for the import of its name, and says it has a
 * client only when the import's own barrel carries one.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateCode } from "../src/apis/generator/generate-code";
import { IMPORTS_STATE_VERSION, saveImportsState } from "../src/apis/imports-state";
import { parseSpec } from "../src/apis/parser/parse-spec";
import { buildSourceScan } from "../src/server/build-source-scan";
import { loadCourierConfig } from "../src/server/config-loader";
import { bodyHash } from "../src/server/import-files/body-hash";
import { importsSnapshotOf } from "../src/server/imports-bridge";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");
const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Pets", version: "1" },
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          tags: ["pets"],
          responses: { "200": { description: "ok" } },
        },
      },
    },
  }),
);

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-source-scan-")));
  symlinkSync(REPO_NODE_MODULES, join(root, "node_modules"), "dir");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/* The import as Studio writes it: its files, and the record of them. */
function generate(generateClient: "direct" | "none"): void {
  const files = generateCode(SPEC, {
    type: "openapi",
    outputDir: "src/api",
    sourceName: "pets",
    generateClient,
  });
  for (const file of files) {
    mkdirSync(dirname(join(root, file.path)), { recursive: true });
    writeFileSync(join(root, file.path), file.content);
  }
  const recorded = Object.fromEntries(
    files.map((file) => [file.path, { sha256: bodyHash(file.content) }]),
  );
  const at = "2026-01-01T00:00:00.000Z";
  const pets = {
    specHash: "h",
    fetchedAt: at,
    lastSyncedAt: at,
    dir: "src/api/pets",
    files: recorded,
  };
  saveImportsState(root, { version: IMPORTS_STATE_VERSION, imports: { pets }, applied: [] });
}

async function scan(
  config: string,
): Promise<Array<{ name: string; isImported: boolean; hasClient: boolean }>> {
  writeFileSync(join(root, "courier.config.ts"), config);
  const loaded = await loadCourierConfig(root);
  const { sources } = buildSourceScan(loaded, importsSnapshotOf(loaded.config.imports, root), root);
  return sources.map(({ name, isImported, hasClient }) => ({ name, isImported, hasClient }));
}

const ENTRY = (extra = "") =>
  `imports: { pets: { importType: "file", type: "openapi", outputDir: "src/api"${extra} } }`;

describe("the source catalogue", () => {
  it("does not take a hand-written source for the import of its name", async () => {
    generate("direct");

    const sources = await scan(
      `export default { sources: { pets: { baseURL: "https://pets.example" } }, ${ENTRY()} };\n`,
    );

    expect(sources).toEqual([{ name: "pets", isImported: false, hasClient: false }]);
  }, 30_000);

  it("marks the source the config imports from the generated file as imported, with its client", async () => {
    generate("direct");

    const sources = await scan(
      `import { pets } from "./src/api/pets/source";\nexport default { sources: { pets }, ${ENTRY()} };\n`,
    );

    expect(sources).toEqual([{ name: "pets", isImported: true, hasClient: true }]);
  }, 30_000);

  it("describes each endpoint as the Playground sends it: its transport, variables and proxy routes", async () => {
    const api = [
      'import { courier, defineApi, defineGroup } from "@noverax/courier/define";',
      "const { endpoint, stream } = courier();",
      'const users = defineGroup({ prefix: "v2/users", endpoints: {',
      '  byId: endpoint.get(":id").variables<{ id: number }>(),',
      '  create: endpoint.post("").variables<{ name: string }>(),',
      "  ticks: stream.response<{ n: number }>().implement(async function* () {}),",
      "} });",
      "export const api = defineApi({",
      '  baseURL: "http://localhost:7501",',
      '  proxyPath: { http: "/api/request", sse: "/api/sse" },',
      "  groups: { users },",
      "});",
    ].join("\n");
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/api.ts"), api);
    writeFileSync(
      join(root, "courier.config.ts"),
      'import { api } from "./src/api";\nexport default { sources: { api } };\n',
    );

    const loaded = await loadCourierConfig(root);
    const [source] = buildSourceScan(loaded, importsSnapshotOf(undefined, root), root).sources;
    const [users] = source?.groups ?? [];
    const analyses = new Map(users?.endpoints.map((e) => [e.name, e.analysis]));

    expect(source?.proxyPath).toEqual({ http: "/api/request", sse: "/api/sse" });
    expect(users?.prefix).toBe("v2/users");
    expect(analyses.get("byId")).toEqual(
      expect.objectContaining({ httpMethod: "get", path: ":id", type: "query" }),
    );
    expect(analyses.get("byId")).not.toHaveProperty("transport");
    expect(analyses.get("create")).toEqual(
      expect.objectContaining({ httpMethod: "post", path: "", type: "mutation" }),
    );
    expect(analyses.get("ticks")).toEqual(expect.objectContaining({ transport: "sse" }));
  }, 30_000);

  it("says an import declared without a client has none, though its barrel and groups have index files", async () => {
    generate("none");

    const config = `import { pets } from "./src/api/pets/source";\nexport default { sources: { pets }, ${ENTRY(', generateClient: "none"')} };\n`;
    const sources = await scan(config);

    expect(sources).toEqual([{ name: "pets", isImported: true, hasClient: false }]);
  }, 30_000);
});

describe("an endpoint in the source catalogue", () => {
  it("lists the fields an endpoint's variables schema declares, each with its type and whether it is required", async () => {
    const config = [
      `import { courier, defineApi, defineGroup } from "@noverax/courier/define";`,
      `import { z } from "zod";`,
      `const { endpoint } = courier();`,
      `const orders = defineGroup({ prefix: "orders", endpoints: {`,
      `  create: endpoint.post("").variables(z.object({ sku: z.string(), qty: z.number().optional() })),`,
      `  list: endpoint.get("").response<unknown>(),`,
      `} });`,
      `export default { sources: { api: defineApi({ baseURL: "https://api.example", groups: { orders } }) } };`,
    ].join("\n");
    writeFileSync(join(root, "courier.config.ts"), config);
    const loaded = await loadCourierConfig(root);

    const { sources } = buildSourceScan(loaded, importsSnapshotOf(undefined, root), root);

    const endpoints = sources[0]?.groups[0]?.endpoints ?? [];
    expect(endpoints.find((e) => e.name === "create")?.analysis.variablesFields).toEqual([
      { path: "sku", type: "string", required: true },
      { path: "qty", type: "number", required: false },
    ]);
    expect(endpoints.find((e) => e.name === "list")?.analysis).not.toHaveProperty(
      "variablesFields",
    );
  }, 30_000);

  it("says how a stream is carried and which middleware its source runs", async () => {
    const config = [
      `import { courier, defineApi, defineGroup } from "@noverax/courier/define";`,
      `import { defineMiddleware } from "@noverax/courier/middleware";`,
      `const { endpoint, stream } = courier();`,
      `const stamp = defineMiddleware("stamp", "before", async () => {});`,
      `const live = defineGroup({ prefix: "live", endpoints: {`,
      `  ticks: stream.response<{ n: number }>().get("sse"),`,
      `  list: endpoint.get("items").response<unknown>(),`,
      `} });`,
      `export default { sources: { api: defineApi({ baseURL: "https://api.example", middleware: [stamp], groups: { live } }) } };`,
    ].join("\n");
    writeFileSync(join(root, "courier.config.ts"), config);
    const loaded = await loadCourierConfig(root);

    const { sources } = buildSourceScan(
      loaded,
      importsSnapshotOf(loaded.config.imports, root),
      root,
    );

    const endpoints = sources[0]?.groups[0]?.endpoints ?? [];
    expect(endpoints.find((e) => e.name === "ticks")?.analysis).toMatchObject({
      path: "sse",
      transport: "sse",
      middleware: ["stamp"],
    });
    expect(endpoints.find((e) => e.name === "list")?.analysis).not.toHaveProperty("transport");
  }, 30_000);

  it("marks a channel the app serves itself, and not a stream it calls", async () => {
    const config = [
      `import { courier, defineApi, defineGroup } from "@noverax/courier/define";`,
      `const { stream, channel } = courier();`,
      `const live = defineGroup({ prefix: "live", endpoints: {`,
      `  ticks: stream.response<{ n: number }>().get("sse"),`,
      `  chat: channel.send<{ text: string }>().response<{ text: string }>().implement(() => ({})),`,
      `} });`,
      `export default { sources: { api: defineApi({ baseURL: "https://api.example", groups: { live } }) } };`,
    ].join("\n");
    writeFileSync(join(root, "courier.config.ts"), config);
    const loaded = await loadCourierConfig(root);

    const { sources } = buildSourceScan(
      loaded,
      importsSnapshotOf(loaded.config.imports, root),
      root,
    );

    const endpoints = sources[0]?.groups[0]?.endpoints ?? [];
    expect(endpoints.find((e) => e.name === "chat")?.analysis).toMatchObject({ served: true });
    const ticks = endpoints.find((e) => e.name === "ticks")?.analysis;
    expect(ticks).toBeDefined();
    expect(ticks).not.toHaveProperty("served");
  }, 30_000);

  it("names the verb each endpoint is addressed with, the reads beyond GET included", async () => {
    const config = [
      `import { courier, defineApi, defineGroup } from "@noverax/courier/define";`,
      `const { endpoint } = courier();`,
      `const items = defineGroup({ prefix: "items", endpoints: {`,
      `  search: endpoint.query("search"),`,
      `  check: endpoint.head(":id"),`,
      `  allowed: endpoint.options(""),`,
      `  remove: endpoint.del(":id"),`,
      `} });`,
      `export default { sources: { api: defineApi({ baseURL: "https://api.example", groups: { items } }) } };`,
    ].join("\n");
    writeFileSync(join(root, "courier.config.ts"), config);
    const loaded = await loadCourierConfig(root);

    const { sources } = buildSourceScan(loaded, importsSnapshotOf(undefined, root), root);

    const endpoints = sources[0]?.groups[0]?.endpoints ?? [];
    expect(endpoints.map((e) => [e.name, e.analysis.httpMethod, e.analysis.type])).toEqual([
      ["search", "query", "query"],
      ["check", "head", "query"],
      ["allowed", "options", "query"],
      ["remove", "delete", "mutation"],
    ]);
  }, 30_000);
});
