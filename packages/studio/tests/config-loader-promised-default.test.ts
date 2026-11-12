/**
 * A courier.config whose default export is a promise, as Studio loads it:
 * the config it settles to, and, when it rejects, a failure like any other
 * the config's code throws — its text and its cause with the environment's
 * values masked, for the log, the pages and an editor's MCP log alike.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadCourierConfig } from "../src/server/config-loader";
import { failureOf } from "../src/server/project-state/failure-of";
import { stubOwnEnvironment } from "./helpers/own-environment";

/* A key no environment holds, put there for the test alone. */
const KEY = "FAKE-0000-PROBE-SECRET";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-promised-config-")));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("loadCourierConfig on a config exported as a promise", () => {
  it("loads the config the promise settles to", async () => {
    writeFileSync(
      join(dir, "courier.config.mjs"),
      `export default Promise.resolve({ sources: {} });\n`,
    );

    const { config } = await loadCourierConfig(dir);

    expect(config.sources).toEqual({});
  });

  it("says the promise's rejection as the config's code failing, with the environment's values masked", async () => {
    stubOwnEnvironment({ PROBE_API_KEY: KEY }, `cannot reach db.invalid with key ${KEY}`);
    writeFileSync(
      join(dir, "courier.config.mjs"),
      `export default new Promise((_, reject) =>
  setTimeout(() => reject(new Error("cannot reach db.invalid with key " + process.env.PROBE_API_KEY)), 20),
);\n`,
    );

    const failure: unknown = await loadCourierConfig(dir).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: "CONFIG_INVALID" });
    expect(String(failure)).toContain("cannot reach db.invalid with key [redacted]");
    expect((failure as Error).cause).toMatchObject({
      name: "ConfigLoadError",
      code: "EVALUATION_FAILED",
    });
    expect(failureOf(failure, dir).message).not.toContain(KEY);
    for (let error: unknown = failure; error instanceof Error; error = error.cause) {
      expect(`${error.message}\n${error.stack}`).not.toContain(KEY);
    }
  });
});
