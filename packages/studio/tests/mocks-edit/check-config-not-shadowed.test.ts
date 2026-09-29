/**
 * The mocks file's import of the config must load the config Studio runs; a
 * compiled copy, a different extension or a directory the loader reaches
 * first is refused, with the file it would load named.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkConfigNotShadowed } from "../../src/server/mocks-edit/check-config-not-shadowed";

let root: string;

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-shadow-")));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function files(names: Record<string, string>): void {
  for (const [name, text] of Object.entries(names)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), text);
  }
}

async function outcome(configName: string, specifier: string, mocksName = "courier.mocks.ts") {
  try {
    await checkConfigNotShadowed(root, configName, mocksName, specifier);
    return "passes";
  } catch (error) {
    return error;
  }
}

describe("checkConfigNotShadowed", () => {
  it("passes an import that loads the config", async () => {
    files({ "courier.config.ts": "export default {};\n" });

    expect(await outcome("courier.config.ts", "./courier.config")).toBe("passes");
  });

  it("refuses an extensionless import that a compiled .js beside the config wins", async () => {
    files({
      "courier.config.ts": "export default {};\n",
      "courier.config.js": "module.exports = {};\n",
    });

    expect(await outcome("courier.config.ts", "./courier.config")).toMatchObject({
      code: "CONFIG_SHADOWED",
      message:
        'courier.config.js sits beside courier.config.ts, so the import of "./courier.config" in courier.mocks.ts would load courier.config.js, not courier.config.ts, which Studio loads. Delete or move courier.config.js — most likely compiled output — then ask again.',
    });
  });

  it("passes an import that names the config's own extension, a compiled copy beside it or not", async () => {
    files({
      "courier.config.ts": "export default {};\n",
      "courier.config.js": "module.exports = {};\n",
    });

    expect(await outcome("courier.config.ts", "./courier.config.ts")).toBe("passes");
  });

  it("refuses an import a .tsx beside a .cts config wins", async () => {
    files({
      "courier.config.cts": "export default {};\n",
      "courier.config.tsx": "export default {};\n",
    });

    expect(await outcome("courier.config.cts", "./courier.config")).toMatchObject({
      code: "CONFIG_SHADOWED",
    });
  });

  it("refuses an import a directory with an index at the compiled name wins", async () => {
    files({
      "courier.config.mts": "export default {};\n",
      "courier.config.mjs/index.js": "module.exports = {};\n",
    });

    expect(
      await outcome("courier.config.mts", "./courier.config.mjs", "courier.mocks.mts"),
    ).toMatchObject({
      code: "CONFIG_SHADOWED",
      message: expect.stringContaining("would load courier.config.mjs/index.js"),
    });
  });

  it("passes an import of a .cts config by its compiled name when nothing is compiled", async () => {
    files({ "courier.config.cts": "export default {};\n" });

    expect(await outcome("courier.config.cts", "./courier.config.cjs")).toBe("passes");
  });
});
