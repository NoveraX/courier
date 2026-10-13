/**
 * Courier Studio, the VS Code extension, on the enterprise project, inside
 * VS Code itself, with Studio running for the project: how soon the editor
 * shows the hints over a file's calls — the first file while the extension
 * starts, then the next ones — going to an endpoint's declaration, and what
 * the extension host holds. The VS Code is the one a Mac has installed, the one
 * VSCODE_PATH names, or the latest stable, which is downloaded.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { measured, percentiles } from "./metrics.mjs";

const require = createRequire(import.meta.url);
const MAC_CODE = "/Applications/Visual Studio Code.app/Contents/MacOS/Code";

/**
 * Open the project in VS Code with the extension, and measure it.
 *
 * @param {{ dir: string, repo: string }} fixture - The project, with Studio running for it, and the repository
 * @returns {Promise<import("./metrics.mjs").Measured[]>} The figures
 * @example
 * ```js
 * await measureExtension(fixture);
 * ```
 */
export async function measureExtension({ dir, repo }) {
  const { runTests } = require("@vscode/test-electron");
  const scratch = mkdtempSync(join(tmpdir(), "courier-scale-vscode-"));
  const report = join(scratch, "report.json");
  const editor = process.env.VSCODE_PATH ?? (existsSync(MAC_CODE) ? MAC_CODE : undefined);
  try {
    await runTests({
      ...(editor ? { vscodeExecutablePath: editor } : {}),
      extensionDevelopmentPath: [
        join(repo, "packages/vscode"),
        join(repo, "packages/vscode-file-icons"),
      ],
      extensionTestsPath: join(import.meta.dirname, "extension-suite.cjs"),
      extensionTestsEnv: { COURIER_SCALE_REPORT: report },
      launchArgs: [
        dir,
        "--disable-extensions",
        "--disable-workspace-trust",
        "--skip-welcome",
        "--skip-release-notes",
        "--user-data-dir",
        join(scratch, "user-data"),
        "--extensions-dir",
        join(scratch, "extensions"),
      ],
    });
    const seen = JSON.parse(readFileSync(report, "utf8"));
    const next = percentiles(seen.next.map((each) => each.ms));
    return [
      measured("extension.firstHints", seen.first.ms, "ms", 10_000, {
        note: `${seen.first.hints} hints over the first file opened, while the extension starts`,
      }),
      measured("extension.hints", next.p50, "ms", 1_000, {
        note: `the next ${seen.next.length} files, ${seen.next[0]?.hints ?? 0} hints each; slowest ${Math.round(next.max)} ms`,
      }),
      measured("extension.definition", seen.definition.ms, "ms", 1_000, {
        note: `${seen.definition.found} declaration found from a call`,
      }),
      measured("extension.hostHeap", seen.hostHeapMb, "MB", 600, {
        note: `the extension host's heap, every extension in it; rss ${Math.round(seen.hostRssMb)} MB`,
      }),
    ];
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
