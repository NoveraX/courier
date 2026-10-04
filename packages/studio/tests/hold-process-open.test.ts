/**
 * Holding the process open: a process with nothing else to do stays alive
 * while held, and exits once released.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const HOLD = pathToFileURL(join(__dirname, "../src/server/hold-process-open.ts")).href;

/* A process whose only other work is a timer that does not keep it alive. */
function runFor(held: boolean) {
  const script =
    `import { holdProcessOpen } from ${JSON.stringify(HOLD)};\n` +
    `const release = ${held ? "holdProcessOpen()" : "() => undefined"};\n` +
    "setTimeout(() => { console.log('still running'); release(); }, 300).unref();\n";
  return spawnSync(process.execPath, ["--import", TSX, "--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: 20_000,
  });
}

describe("holdProcessOpen", () => {
  it("keeps a process with nothing else to do alive until released, then lets it exit", () => {
    const result = runFor(true);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("still running\n");
  });

  it("is what keeps it alive: without it the process exits at once", () => {
    const result = runFor(false);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});
