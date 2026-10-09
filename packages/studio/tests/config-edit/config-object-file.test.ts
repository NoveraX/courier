import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { configObjectFile } from "../../src/server/config-edit/config-object-file";

const OBJECT = "export default { sources: {} };\n";

let made: string[] = [];

afterEach(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
  made = [];
});

function tree(files: Record<string, string>): string {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "config-object-")));
  made.push(base);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(base, path)), { recursive: true });
    writeFileSync(join(base, path), text);
  }
  return base;
}

describe("configObjectFile", () => {
  it("is the config itself when the config writes its object", () => {
    const root = tree({ "courier.config.ts": OBJECT });

    expect(configObjectFile(join(root, "courier.config.ts"), root)).toBe(
      join(root, "courier.config.ts"),
    );
  });

  it("follows the default export on, module to module, as an extensionless or .js import names it", () => {
    const root = tree({
      "courier.config.ts": 'export { default } from "./src/courier/config";\n',
      "src/courier/config.ts": 'import config from "./settings.js";\nexport default config;\n',
      "src/courier/settings.ts": OBJECT,
    });

    expect(configObjectFile(join(root, "courier.config.ts"), root)).toBe(
      join(root, "src/courier/settings.ts"),
    );
  });

  it("stops at a package, at a module outside the project, and at one that does not parse", () => {
    const outside = tree({ "config.ts": OBJECT });
    const root = tree({
      "a/courier.config.ts": 'export { default } from "@acme/courier-config";\n',
      "b/courier.config.ts": `export { default } from "${join(outside, "config")}";\n`,
      "c/courier.config.ts": 'export { default } from "./broken";\n',
      "c/broken.ts": "export default {\n",
    });

    for (const project of ["a", "b"]) {
      const config = join(root, project, "courier.config.ts");
      expect(configObjectFile(config, join(root, project))).toBe(config);
    }
    expect(configObjectFile(join(root, "c/courier.config.ts"), join(root, "c"))).toBe(
      join(root, "c/broken.ts"),
    );
  });

  it("stops where two modules pass each other's default on", () => {
    const root = tree({
      "courier.config.ts": 'export { default } from "./a";\n',
      "a.ts": 'export { default } from "./b";\n',
      "b.ts": 'export { default } from "./a";\n',
    });

    expect([join(root, "a.ts"), join(root, "b.ts")]).toContain(
      configObjectFile(join(root, "courier.config.ts"), root),
    );
  });
});
