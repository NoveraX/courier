/**
 * Whether a reported change leaves Studio running what the changed files
 * hold: true only when each is a module the running load evaluated and
 * holds that text; never for a file the load did not evaluate, nor for the
 * config or the mocks file whose content the load could not tell.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { LoadedCourierConfig } from "../src/server/config-loader";
import { evaluatedTextHash } from "../src/server/observed-transforms";
import { runsWhatChangedHolds } from "../src/server/runs-what-changed-holds";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function project() {
  const dir = mkdtempSync(join(tmpdir(), "courier-runs-holds-"));
  dirs.push(dir);
  const config = join(dir, "courier.config.ts");
  const api = join(dir, "api.ts");
  const data = join(dir, "data.json");
  writeFileSync(config, "export default {}\n");
  writeFileSync(api, "export const a = 1\n");
  writeFileSync(data, "{}\n");
  return { config, api, data };
}

function running(
  files: ReturnType<typeof project>,
  contentHash: string | null = "known",
): LoadedCourierConfig {
  return {
    config: { sources: {} },
    configFile: files.config,
    contentHash,
    deps: [],
    depHashes: new Map<string, string>(),
    mocks: { file: null, entries: {}, contentHash: null, error: null },
    evaluated: new Map([
      [files.config, evaluatedTextHash("export default {}\n")],
      [files.api, evaluatedTextHash("export const a = 1\n")],
    ]),
  };
}

describe("runsWhatChangedHolds", () => {
  it("is true when every changed module holds the text the running load evaluated", () => {
    const files = project();

    expect(runsWhatChangedHolds(running(files), [files.api, files.config])).toBe(true);
  });

  it("is false once a changed module holds another text", () => {
    const files = project();
    writeFileSync(files.api, "export const a = 2\n");

    expect(runsWhatChangedHolds(running(files), [files.api])).toBe(false);
  });

  it("is false for a file the load did not evaluate itself, such as JSON", () => {
    const files = project();

    expect(runsWhatChangedHolds(running(files), [files.data])).toBe(false);
  });

  it("is false for the config when the load could not tell what it held", () => {
    const files = project();

    expect(runsWhatChangedHolds(running(files, null), [files.config])).toBe(false);
  });

  it("is false while nothing runs, or for no change at all", () => {
    const files = project();

    expect(runsWhatChangedHolds(null, [files.api])).toBe(false);
    expect(runsWhatChangedHolds(running(files), [])).toBe(false);
  });
});
