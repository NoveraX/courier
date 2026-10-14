/**
 * Each module only a server runs has its stand-in under `src/browser/`,
 * which a page's bundle takes in its place: one of the same path, with the
 * same exports, built to `lib/browser/` beside the module itself.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SERVER_ONLY_MODULES, serverOnlyEntries } from "../../tsdown.server-only";

const SOURCE = new URL("../../src/", import.meta.url);

/* The names a source module exports, by its path under `src/`. */
async function exportsOf(path: string): Promise<string[]> {
  const module: Record<string, unknown> = await import(fileURLToPath(new URL(path, SOURCE)));
  return Object.keys(module).sort();
}

describe("the stand-ins of the modules only a server runs", () => {
  it.each(SERVER_ONLY_MODULES)("%s has one with the same exports", async (module) => {
    const server = await exportsOf(`${module}.ts`);

    expect(await exportsOf(`browser/${module}.ts`)).toEqual(server);
    expect(server.length).toBeGreaterThan(0);
  });

  it("are built beside the modules themselves", () => {
    expect(serverOnlyEntries()).toEqual({
      "logger/server": "src/logger/server.ts",
      "browser/logger/server": "src/browser/logger/server.ts",
      "utils/forwarded-for": "src/utils/forwarded-for.ts",
      "browser/utils/forwarded-for": "src/browser/utils/forwarded-for.ts",
      "session/validate-forward": "src/session/validate-forward.ts",
      "browser/session/validate-forward": "src/browser/session/validate-forward.ts",
    });
  });
});
