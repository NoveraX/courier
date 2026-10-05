/**
 * Waiting for work under a timeout: the work's own outcome when it settles
 * in time, what `expired` returns when it does not, and a timer that does
 * not keep the process alive.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { withTimeout } from "../src/server/with-timeout";

const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const WITH_TIMEOUT = pathToFileURL(join(__dirname, "../src/server/with-timeout.ts")).href;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* A process whose only pending work is a promise that never settles, waited for under a timeout. */
function waitForever() {
  const script =
    `import { withTimeout } from ${JSON.stringify(WITH_TIMEOUT)};\n` +
    "const started = Date.now();\n" +
    'withTimeout(new Promise(() => {}), 300, () => new Error("timed out"))' +
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the template is the fixture's source code, written out as text
    ".catch((error) => console.log(`${error.message} after ${Date.now() - started} ms`));\n";
  return spawnSync(process.execPath, ["--import", TSX, "--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: 20_000,
  });
}

describe("withTimeout", () => {
  it("resolves with what the work resolves with when it settles in time", async () => {
    const expired = vi.fn(() => new Error("timed out"));

    await expect(withTimeout(Promise.resolve("loaded"), 1000, expired)).resolves.toBe("loaded");
    expect(expired).not.toHaveBeenCalled();
  });

  it("rejects with what the work rejects with when it settles in time", async () => {
    const expired = vi.fn(() => new Error("timed out"));

    await expect(withTimeout(Promise.reject(new Error("refused")), 1000, expired)).rejects.toThrow(
      "refused",
    );
    expect(expired).not.toHaveBeenCalled();
  });

  it("rejects with what expired returns once the time runs out, and calls it once", async () => {
    const expired = vi.fn(() => new Error("timed out"));

    await expect(withTimeout(new Promise(() => {}), 50, expired)).rejects.toThrow("timed out");
    await sleep(100);
    expect(expired).toHaveBeenCalledOnce();
  });

  it("stops its timer once the work settles", async () => {
    const expired = vi.fn(() => new Error("timed out"));

    await withTimeout(sleep(10), 50, expired);
    await sleep(100);

    expect(expired).not.toHaveBeenCalled();
  });

  it("does not keep a process with nothing else to do alive", () => {
    const result = waitForever();

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});
