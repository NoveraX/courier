import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { sourcesModuleFor } from "../../src/server/config-edit/sources-module";

const SOURCES = 'import { api } from "../src/api";\n\nexport const sources = { api };\n';

let made: string[] = [];

afterEach(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
  made = [];
});

function tree(files: Record<string, string>): string {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "sources-module-")));
  made.push(base);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(base, path)), { recursive: true });
    writeFileSync(join(base, path), text);
  }
  return base;
}

function moduleOf(config: string, files: Record<string, string> = {}) {
  const root = tree({ "courier.config.ts": config, "lib/sources.ts": SOURCES, ...files });
  return sourcesModuleFor(join(root, "courier.config.ts"), root);
}

describe("sourcesModuleFor", () => {
  it("finds the module a config imports its sources from by name", () => {
    const found = moduleOf(
      'import { defineConfig } from "@noverax/courier-studio";\nimport { sources } from "./lib/sources";\n\nexport default defineConfig({ sources });\n',
    );

    expect(found).toMatchObject({ file: "lib/sources.ts", exportName: "sources" });
  });

  it("names the export the config imports, under the local name it gives it", () => {
    const renamed = moduleOf(
      'import { all as list } from "./lib/sources";\n\nexport default { sources: list };\n',
    );
    const byDefault = moduleOf(
      'import list from "./lib/sources";\n\nexport default { sources: list satisfies object };\n',
    );

    expect(renamed).toMatchObject({ file: "lib/sources.ts", exportName: "all" });
    expect(byDefault).toMatchObject({ file: "lib/sources.ts", exportName: "default" });
  });

  it("follows a tsconfig path alias and a .js specifier to the module", () => {
    const tsconfig = JSON.stringify({
      compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] } },
    });

    const aliased = moduleOf(
      'import { sources } from "@/lib/sources";\n\nexport default { sources };\n',
      { "tsconfig.json": tsconfig },
    );
    const withExtension = moduleOf(
      'import { sources } from "./lib/sources.js";\n\nexport default { sources };\n',
    );

    expect(aliased?.file).toBe("lib/sources.ts");
    expect(withExtension?.file).toBe("lib/sources.ts");
  });

  it("is nothing when the config writes its sources itself, or declares them in a const", () => {
    expect(
      moduleOf('import { api } from "./src/api";\n\nexport default { sources: { api } };\n'),
    ).toBeUndefined();
    expect(
      moduleOf(
        'import { api } from "./src/api";\n\nconst sources = { api };\n\nexport default { sources };\n',
      ),
    ).toBeUndefined();
  });

  it("is nothing for a type-only import, a namespace, or a module it cannot resolve", () => {
    expect(
      moduleOf('import type { sources } from "./lib/sources";\n\nexport default { sources };\n'),
    ).toBeUndefined();
    expect(
      moduleOf('import * as sources from "./lib/sources";\n\nexport default { sources };\n'),
    ).toBeUndefined();
    expect(
      moduleOf('import { sources } from "./lib/missing";\n\nexport default { sources };\n'),
    ).toBeUndefined();
  });

  it("is nothing for a package, or a module outside the project", () => {
    const outside = tree({ "sources.ts": SOURCES });

    const fromPackage = moduleOf(
      'import { sources } from "@acme/sources";\n\nexport default { sources };\n',
      { "node_modules/@acme/sources/index.ts": SOURCES },
    );
    const fromOutside = moduleOf(
      `import { sources } from "${join(outside, "sources")}";\n\nexport default { sources };\n`,
    );

    expect(fromPackage).toBeUndefined();
    expect(fromOutside).toBeUndefined();
  });

  it("is nothing for a config that does not parse, or cannot be read", () => {
    const root = tree({ "courier.config.ts": "export default {\n" });

    expect(sourcesModuleFor(join(root, "courier.config.ts"), root)).toBeUndefined();
    expect(sourcesModuleFor(join(root, "missing.config.ts"), root)).toBeUndefined();
  });
});
