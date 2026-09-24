/**
 * @vitest-environment node
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createConfigJiti } from "../src/runtime/config-jiti";

let root: string;

function write(relative: string, contents: string): void {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-config-jiti-")));
  write("tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "@app/*": ["./src/*"] } } }));
  write("src/value.ts", 'export const origin = "project";\n');
  write("node_modules/@app/value/package.json", JSON.stringify({ name: "@app/value", main: "index.js" }));
  write("node_modules/@app/value/index.js", 'exports.origin = "installed";\n');
  write("entry.ts", 'export { origin } from "@app/value";\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("createConfigJiti", () => {
  it("resolves an import through the project's path aliases by default", async () => {
    const jiti = await createConfigJiti(join(root, "entry.ts"));

    const loaded = await jiti.import<{ origin: string }>(join(root, "entry.ts"));

    expect(loaded.origin).toBe("project");
  });

  it("resolves the same import to the installed package with aliases off", async () => {
    const jiti = await createConfigJiti(join(root, "entry.ts"), { aliases: false });

    const loaded = await jiti.import<{ origin: string }>(join(root, "entry.ts"));

    expect(loaded.origin).toBe("installed");
  });
});
