import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractConfigDeps } from "../src/server/extract-config-deps";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-extract-deps-"));
});

afterEach(() => {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

function file(rel: string, body: string): string {
  const abs = join(dir, rel);
  const parent = abs.slice(0, abs.lastIndexOf("/"));
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  writeFileSync(abs, body, "utf-8");
  return abs;
}

describe("extractConfigDeps", () => {
  it("returns just the entry file when no imports", () => {
    const entry = file("courier.config.ts", `export default { sources: {} };`);
    expect(extractConfigDeps(entry)).toEqual([entry]);
  });

  it("follows one-level relative imports", () => {
    const dep = file("src/api.ts", `export const api = {};`);
    const entry = file("courier.config.ts", `import { api } from "./src/api";\nexport default { sources: { api } };`);
    expect(extractConfigDeps(entry)).toEqual([entry, dep]);
  });

  it("follows two-level transitive imports", () => {
    const inner = file("src/types.ts", `export type T = number;`);
    const dep = file("src/api.ts", `import type { T } from "./types";\nexport const api: T = 1;`);
    const entry = file("courier.config.ts", `import { api } from "./src/api";\nexport default { sources: { api } };`);
    expect(extractConfigDeps(entry)).toEqual([entry, dep, inner]);
  });

  it("tolerates cycles without hanging", () => {
    const a = file("a.ts", `import "./b";`);
    const b = file("b.ts", `import "./a";`);
    expect(extractConfigDeps(a)).toEqual([a, b]);
  });

  it("skips bare specifiers", () => {
    const entry = file("courier.config.ts", `import { defineConfig } from "@noverax/courier/config";\nexport default defineConfig({ sources: {} });`);
    expect(extractConfigDeps(entry)).toEqual([entry]);
  });

  it("resolves directory imports via index.ts", () => {
    const inner = file("src/api/index.ts", `export const api = {};`);
    const entry = file("courier.config.ts", `import { api } from "./src/api";\nexport default { sources: { api } };`);
    expect(extractConfigDeps(entry)).toEqual([entry, inner]);
  });

  it("returns empty array when entry file does not exist", () => {
    expect(extractConfigDeps(join(dir, "missing.ts"))).toEqual([]);
  });
});
