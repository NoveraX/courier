/*
 * The extension inside VS Code itself: a stand-in Studio answers as the real
 * one does, a workspace's project says where it runs, and the suite opens a
 * file there and reads the hints the editor shows over its calls.
 *
 * Runs the VS Code at VSCODE_PATH, or the one installed on a Mac, or else
 * the version @vscode/test-electron downloads, as CI does.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const here = fileURLToPath(new URL(".", import.meta.url));
const extension = join(here, "../..");
const MAC_CODE = "/Applications/Visual Studio Code.app/Contents/MacOS/Code";

const stats = [
  {
    source: "shop",
    endpoint: "orders.place",
    calls: 3,
    failed: 1,
    pending: 0,
    statuses: { 201: 2, 500: 1 },
    p50: 20,
    p95: 40,
  },
];
const calls = [
  {
    line: 2,
    column: 18,
    endLine: 2,
    endColumn: 23,
    endpoints: [{ source: "shop", endpoint: "orders.place" }],
  },
];
const studio = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(req.url === "/api/editor/calls" ? { calls } : { endpoints: stats }));
});
await new Promise((resolve) => studio.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${studio.address().port}`;

const scratch = mkdtempSync(join(tmpdir(), "courier-vscode-editor-"));
const workspace = join(scratch, "shop");
mkdirSync(join(workspace, ".courier"), { recursive: true });
mkdirSync(join(workspace, "src"), { recursive: true });
writeFileSync(
  join(workspace, ".courier/studio.json"),
  JSON.stringify({ url, pid: process.pid, version: "0.0.0" }),
);
writeFileSync(
  join(workspace, "src/cart.ts"),
  "// checkout\nawait api.orders.place({ sku: 'A' });\n",
);
const report = join(scratch, "report.json");

try {
  await runTests({
    ...(process.env.VSCODE_PATH || existsSync(MAC_CODE)
      ? { vscodeExecutablePath: process.env.VSCODE_PATH || MAC_CODE }
      : {}),
    extensionDevelopmentPath: extension,
    extensionTestsPath: join(here, "suite.cjs"),
    extensionTestsEnv: { COURIER_EDITOR_REPORT: report, COURIER_EDITOR_STUDIO: url },
    launchArgs: [
      workspace,
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
  console.log(readFileSync(report, "utf8"));
} finally {
  studio.close();
  rmSync(scratch, { recursive: true, force: true });
}
