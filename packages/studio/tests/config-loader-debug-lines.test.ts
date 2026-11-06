/**
 * What Studio's loader writes at debug level of a config whose code
 * throws, before it runs the file another way: the error masked as a load
 * error masks it, its stack included, since a debug log is the one most
 * often pasted into an issue.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadCourierConfig } from "../src/server/config-loader";

/* A key no environment holds, put there for the test alone. */
const KEY = "FAKE-0000-PROBE-SECRET";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-debug-lines-")));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

/* Every debug line, each of its parts as the console would show it, an error by its stack. */
function debugLines(debug: { mock: { calls: unknown[][] } }): string {
  return debug.mock.calls
    .map((args) =>
      args.map((arg) => (arg instanceof Error ? `${arg.stack}` : String(arg))).join(" "),
    )
    .join("\n");
}

describe("Studio's loader at debug level", () => {
  it("masks the environment's values in what a courier.config.cjs threw as Node ran it", async () => {
    vi.stubEnv("COURIER_LOG_LEVEL", "debug");
    vi.stubEnv("PROBE_API_KEY", KEY);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    writeFileSync(
      join(dir, "courier.config.cjs"),
      `throw new Error("cannot reach db.invalid with key " + process.env.PROBE_API_KEY);\n`,
    );

    await loadCourierConfig(dir).catch(() => {});

    const written = debugLines(debug);
    expect(written).toContain("did not run as CommonJS");
    expect(written).toContain("cannot reach db.invalid with key [redacted]");
    expect(written).not.toContain(KEY);
  });
});
