import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractConfigDeps } from "../src/server/extract-config-deps";
import { makeFedFifo, stopFifoWriters } from "./helpers/make-fed-fifo";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-extract-deps-")));
});

afterEach(() => {
  vi.restoreAllMocks();
  stopFifoWriters();
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

/** The modules a walk from `entries` reaches, in walk order, without the absent paths it records. */
function walked(...entries: string[]): string[] {
  return [...extractConfigDeps(entries)].filter(([, hash]) => hash !== null).map(([path]) => path);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

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
    expect(walked(entry)).toEqual([entry]);
  });

  it("follows one-level relative imports", () => {
    const dep = file("src/api.ts", `export const api = {};`);
    const entry = file(
      "courier.config.ts",
      `import { api } from "./src/api";\nexport default { sources: { api } };`,
    );
    expect(walked(entry)).toEqual([entry, dep]);
  });

  it("follows two-level transitive imports", () => {
    const inner = file("src/base.ts", `export const base = 1;`);
    const dep = file("src/api.ts", `import { base } from "./base";\nexport const api = base;`);
    const entry = file(
      "courier.config.ts",
      `import { api } from "./src/api";\nexport default { sources: { api } };`,
    );
    expect(walked(entry)).toEqual([entry, dep, inner]);
  });

  it("walks the compiled .js beside a .ts, which is the module the loader runs", () => {
    file("src/api.ts", `import "./typescript-only";\nexport const api = {};`);
    const compiled = file("src/api.js", `export const api = {};`);
    const entry = file(
      "courier.config.ts",
      `import { api } from "./src/api";\nexport default { sources: { api } };`,
    );

    expect(walked(entry)).toEqual([entry, compiled]);
  });

  it("walks the .ts an import written for NodeNext as .js names", () => {
    const dep = file("src/api.ts", `export const api = {};`);
    const entry = file(
      "courier.config.ts",
      `import { api } from "./src/api.js";\nexport default { sources: { api } };`,
    );

    expect(walked(entry)).toEqual([entry, dep]);
  });

  it("tolerates cycles without hanging", () => {
    const a = file("a.ts", `import "./b";`);
    const b = file("b.ts", `import "./a";`);
    expect(walked(a)).toEqual([a, b]);
  });

  it("skips bare specifiers", () => {
    const entry = file(
      "courier.config.ts",
      `import { defineConfig } from "@noverax/courier/config";\nexport default defineConfig({ sources: {} });`,
    );
    expect(walked(entry)).toEqual([entry]);
  });

  it("resolves directory imports via index.ts", () => {
    const inner = file("src/api/index.ts", `export const api = {};`);
    const entry = file(
      "courier.config.ts",
      `import { api } from "./src/api";\nexport default { sources: { api } };`,
    );
    expect(walked(entry)).toEqual([entry, inner]);
  });

  it("returns empty array when entry file does not exist", () => {
    expect(walked(join(dir, "missing.ts"))).toEqual([]);
  });

  it("records the sha256 of the raw bytes it read for each module", () => {
    const dep = join(dir, "src", "latin1.ts");
    mkdirSync(join(dir, "src"));
    writeFileSync(dep, Buffer.from([...Buffer.from("// caf"), 0xe9, 0x0a]));
    const entry = file("courier.config.ts", `import "./src/latin1.ts";\nexport default {};`);

    const hashes = extractConfigDeps([entry]);

    expect([...hashes]).toEqual([
      [entry, sha256(entry)],
      [dep, sha256(dep)],
    ]);
  });

  it("walks the config and the mocks file in one pass, reaching a module both import once", () => {
    const shared = file("src/api.ts", `export const api = {};`);
    const fixtures = file("src/fixtures.ts", `export const users = [];`);
    const config = file(
      "courier.config.ts",
      `import { api } from "./src/api";\nexport default { sources: { api } };`,
    );
    const mocks = file(
      "courier.mocks.ts",
      `import { api } from "./src/api";\nimport { users } from "./src/fixtures";\nexport default { api, users };`,
    );

    expect(walked(config, mocks)).toEqual([config, shared, mocks, fixtures]);
  });

  it("records each path an import that names no module could name one at, as absent", () => {
    mkdirSync(join(dir, "src"));
    const entry = file(
      "courier.config.ts",
      `import { host } from "./src/late";\nimport { api } from "./generated/api";\nexport default {};`,
    );

    const deps = extractConfigDeps([entry]);

    expect(deps.get(entry)).toBe(sha256(entry));
    expect(deps.get(join(dir, "src", "late"))).toBeNull();
    expect(deps.get(join(dir, "src", "late.ts"))).toBeNull();
    expect(deps.get(join(dir, "src", "late.cjs"))).toBeNull();
    expect(deps.get(join(dir, "generated"))).toBeNull();
    expect(deps.has(join(dir, "generated", "api.ts"))).toBe(false);
    expect([...deps.keys()][0]).toBe(entry);
  });

  it("records no absent path for an import that names the first path the loader tries", () => {
    const dep = file("src/api.ts", `export const api = {};`);
    const entry = file(
      "courier.config.ts",
      `import { api } from "./src/api.ts";\nexport default { sources: { api } };`,
    );

    expect([...extractConfigDeps([entry])]).toEqual([
      [entry, sha256(entry)],
      [dep, sha256(dep)],
    ]);
  });

  it("records as absent each path the loader tries before the module an import names", () => {
    const dep = file("src/api.ts", `export const api = {};`);
    const entry = file(
      "courier.config.ts",
      `import { api } from "./src/api";\nexport default { sources: { api } };`,
    );

    expect([...extractConfigDeps([entry])]).toEqual([
      [entry, sha256(entry)],
      [dep, sha256(dep)],
      ...["", ".js", ".mjs", ".cjs"].map((extension) => [
        join(dir, "src", `api${extension}`),
        null,
      ]),
    ]);
  });

  it.skipIf(process.platform === "win32")(
    "a FIFO placed at a dependency path does not block the walk",
    () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const leak = file("src/leak.ts", `export const leak = 1;`);
      const pipe = join(dir, "src", "pipe.ts");
      makeFedFifo(pipe, `import "./leak";\n`);
      const entry = file("courier.config.ts", `import "./src/pipe";\nexport default {};`);

      const hashes = extractConfigDeps([entry]);

      expect(hashes.get(pipe)).toBe("unreadable");
      expect(hashes.has(leak)).toBe(false);
    },
  );
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
    const entry = file(
      "courier.config.ts",
      `import { api } from "@/api";\nexport default { sources: { api } };`,
    );

    expect(walked(entry)).toEqual([entry, dep]);
  });

  it("follows an aliased import that resolves outside the project", () => {
    tsconfig({ "@shared/*": ["./packages/shared/*"] });
    const dep = file("packages/shared/api.ts", `export const api = {};`);
    const entry = file(
      "courier.config.ts",
      `import { api } from "@shared/api";\nexport default { sources: { api } };`,
    );

    expect(walked(entry)).toEqual([entry, dep]);
  });

  it("follows an alias transitively and through a directory index", () => {
    tsconfig({ "@/*": ["./src/*"] });
    const inner = file("src/lib/base.ts", `export const base = 1;`);
    const dep = file(
      "src/lib/index.ts",
      `import { base } from "./base";\nexport const api = base;`,
    );
    const entry = file(
      "courier.config.ts",
      `import { api } from "@/lib";\nexport default { sources: { api } };`,
    );

    expect(walked(entry)).toEqual([entry, dep, inner]);
  });

  it("stops at an alias that shadows an installed package", () => {
    file("node_modules/dep/package.json", JSON.stringify({ name: "dep", main: "index.js" }));
    file("node_modules/dep/index.js", `module.exports = {};`);
    tsconfig({ dep: ["./vendor/dep.ts"] });
    file("vendor/dep.ts", `export const api = {};`);
    const entry = file(
      "courier.config.ts",
      `import { api } from "dep";\nexport default { sources: { api } };`,
    );

    expect(walked(entry)).toEqual([entry]);
  });

  it("walks on without aliases when the tsconfig's paths cannot be read, and says why once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    file("tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "@/*": "./src/*" } } }));
    file("src/api.ts", `export const api = {};`);
    const local = file("src/local.ts", `export const local = {};`);
    const entry = file(
      "courier.config.ts",
      `import "./src/local";\nimport { api } from "@/api";\nexport default {};`,
    );
    const mocks = file("courier.mocks.ts", `import { api } from "@/api";\nexport default {};`);

    expect(walked(entry, mocks)).toEqual([entry, local, mocks]);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[1])).toContain(`tsconfig paths that apply to ${dir}`);
  });

  it("still skips a bare specifier the tsconfig does not map", () => {
    tsconfig({ "@/*": ["./src/*"] });
    const entry = file(
      "courier.config.ts",
      `import { defineConfig } from "@noverax/courier/config";\nexport default defineConfig({ sources: {} });`,
    );

    expect(walked(entry)).toEqual([entry]);
  });

  /* Erased before the config runs: a change to one of them changes nothing Studio loads. */
  it("leaves out modules imported for their types alone, and keeps side-effect and mixed imports", () => {
    file("src/types.ts", `export type T = number;`);
    file("src/reexported.ts", `export type R = string;`);
    const mixed = file("src/mixed.ts", `export type M = 1; export const m = 1;`);
    const side = file("src/side.ts", `globalThis.x = 1;`);
    const entry = file(
      "courier.config.ts",
      [
        `import type { T } from "./src/types";`,
        `export type { R } from "./src/reexported";`,
        `import { type M, m } from "./src/mixed";`,
        `import "./src/side";`,
        `export default { sources: {}, m };`,
      ].join("\n"),
    );

    expect(walked(entry)).toEqual([entry, mixed, side]);
  });

  it("follows an import of the directory itself, as '.' or '..'", () => {
    const index = file("src/index.ts", `export const api = {};`);
    const leaf = file("src/leaf.ts", `import { api } from ".";\nexport const leaf = api;`);
    const entry = file(
      "courier.config.ts",
      `import { leaf } from "./src/leaf";\nexport default { leaf };`,
    );

    expect(walked(entry)).toEqual([entry, leaf, index]);
  });

  it("walks a module reached through a link and by its own path once, by its own path", () => {
    const real = file("shared/api.ts", `export const api = {};`);
    symlinkSync(join(dir, "shared"), join(dir, "linked"));
    const entry = file(
      "courier.config.ts",
      `import { api } from "./linked/api";\nimport { api as again } from "./shared/api";\nexport default { api, again };`,
    );

    expect(walked(entry)).toEqual([entry, real]);
  });
});
