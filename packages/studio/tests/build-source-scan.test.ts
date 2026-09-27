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
    paths: { "/pets": { get: { operationId: "listPets", tags: ["pets"], responses: { "200": { description: "ok" } } } } },
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
  const files = generateCode(SPEC, { type: "openapi", outputDir: "src/api", sourceName: "pets", generateClient });
  for (const file of files) {
    mkdirSync(dirname(join(root, file.path)), { recursive: true });
    writeFileSync(join(root, file.path), file.content);
  }
  const recorded = Object.fromEntries(files.map((file) => [file.path, { sha256: bodyHash(file.content) }]));
  const at = "2026-01-01T00:00:00.000Z";
  const pets = { specHash: "h", fetchedAt: at, lastSyncedAt: at, dir: "src/api/pets", files: recorded };
  saveImportsState(root, { version: IMPORTS_STATE_VERSION, imports: { pets }, applied: [] });
}

async function scan(config: string): Promise<Array<{ name: string; isImported: boolean; hasClient: boolean }>> {
  writeFileSync(join(root, "courier.config.ts"), config);
  const loaded = await loadCourierConfig(root);
  const { sources } = buildSourceScan(loaded, importsSnapshotOf(loaded.config.imports, root), root);
  return sources.map(({ name, isImported, hasClient }) => ({ name, isImported, hasClient }));
}

const ENTRY = (extra = "") => `imports: { pets: { importType: "file", type: "openapi", outputDir: "src/api"${extra} } }`;

describe("the source catalogue", () => {
  it("does not take a hand-written source for the import of its name", async () => {
    generate("direct");

    const sources = await scan(`export default { sources: { pets: { baseURL: "https://pets.example" } }, ${ENTRY()} };\n`);

    expect(sources).toEqual([{ name: "pets", isImported: false, hasClient: false }]);
  }, 30_000);

  it("marks the source the config imports from the generated file as imported, with its client", async () => {
    generate("direct");

    const sources = await scan(`import { pets } from "./src/api/pets/source";\nexport default { sources: { pets }, ${ENTRY()} };\n`);

    expect(sources).toEqual([{ name: "pets", isImported: true, hasClient: true }]);
  }, 30_000);

  it("says an import declared without a client has none, though its barrel and groups have index files", async () => {
    generate("none");

    const config = `import { pets } from "./src/api/pets/source";\nexport default { sources: { pets }, ${ENTRY(', generateClient: "none"')} };\n`;
    const sources = await scan(config);

    expect(sources).toEqual([{ name: "pets", isImported: true, hasClient: false }]);
  }, 30_000);
});
