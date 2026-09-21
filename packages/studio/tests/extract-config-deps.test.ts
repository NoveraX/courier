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

/**
 * A config that names its own modules through tsconfig `paths` depends on them
 * exactly as much as one that spells the relative path, and must reload when
 * they change.
 */
describe("extractConfigDeps — tsconfig paths", () => {
  function tsconfig(paths: Record<string, string[]>): void {
    file("tsconfig.json", JSON.stringify({ compilerOptions: { paths } }));
  }

  it("follows an aliased import inside the project", () => {
    tsconfig({ "@/*": ["./src/*"] });
    const dep = file("src/api.ts", `export const api = {};`);
    const entry = file("courier.config.ts", `import { api } from "@/api";\nexport default { sources: { api } };`);

    expect(extractConfigDeps(entry)).toEqual([entry, dep]);
  });

  it("follows an aliased import that resolves outside the project", () => {
    tsconfig({ "@shared/*": ["./packages/shared/*"] });
    const dep = file("packages/shared/api.ts", `export const api = {};`);
    const entry = file("courier.config.ts", `import { api } from "@shared/api";\nexport default { sources: { api } };`);

    expect(extractConfigDeps(entry)).toEqual([entry, dep]);
  });

  it("follows an alias transitively and through a directory index", () => {
    tsconfig({ "@/*": ["./src/*"] });
    const inner = file("src/lib/types.ts", `export type T = number;`);
    const dep = file("src/lib/index.ts", `import type { T } from "./types";\nexport const api: T = 1;`);
    const entry = file("courier.config.ts", `import { api } from "@/lib";\nexport default { sources: { api } };`);

    expect(extractConfigDeps(entry)).toEqual([entry, dep, inner]);
  });

  it("stops at an alias that shadows an installed package", () => {
    file("node_modules/dep/package.json", JSON.stringify({ name: "dep", main: "index.js" }));
    file("node_modules/dep/index.js", `module.exports = {};`);
    tsconfig({ dep: ["./vendor/dep.ts"] });
    file("vendor/dep.ts", `export const api = {};`);
    const entry = file("courier.config.ts", `import { api } from "dep";\nexport default { sources: { api } };`);

    expect(extractConfigDeps(entry)).toEqual([entry]);
  });

  it("still skips a bare specifier the tsconfig does not map", () => {
    tsconfig({ "@/*": ["./src/*"] });
    const entry = file("courier.config.ts", `import { defineConfig } from "@noverax/courier/config";\nexport default defineConfig({ sources: {} });`);

    expect(extractConfigDeps(entry)).toEqual([entry]);
  });
});
