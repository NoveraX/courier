/**
 * The core's modules only a server runs, read from the browser stand-ins
 * the build publishes.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { serverOnlyModules } from "./server-only-modules.mjs";

const lib = mkdtempSync(join(tmpdir(), "courier-server-only-"));

afterAll(() => rmSync(lib, { recursive: true, force: true }));

describe("serverOnlyModules", () => {
  it("names each module the build gave a browser stand-in, by its path under lib", () => {
    mkdirSync(join(lib, "browser/logger"), { recursive: true });
    mkdirSync(join(lib, "browser/utils"), { recursive: true });
    writeFileSync(join(lib, "browser/logger/server.js"), "");
    writeFileSync(join(lib, "browser/utils/forwarded-for.js"), "");
    writeFileSync(join(lib, "browser/utils/notes.md"), "");

    expect(serverOnlyModules(lib)).toEqual(["logger/server.js", "utils/forwarded-for.js"]);
  });
});
