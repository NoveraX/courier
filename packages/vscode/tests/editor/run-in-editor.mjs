/*
 * The extension inside VS Code itself: a stand-in Studio answers as the real
 * one does, a workspace's project says where it runs, and the suite opens a
 * file there and reads the hints the editor shows over its calls, and the
 * audit's findings it marks at them.
 *
 * Runs the VS Code at VSCODE_PATH; or the version VSCODE_VERSION names, which
 * @vscode/test-electron downloads — `stable`, `insiders`, a version number, or
 * `minimum`, the oldest the extension's engines field takes, as CI runs both
 * ends; or else the one installed on a Mac, or the latest stable.
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

/* Which VS Code to run, as runTests takes it. */
function editorToRun() {
  if (process.env.VSCODE_PATH) return { vscodeExecutablePath: process.env.VSCODE_PATH };
  const asked = process.env.VSCODE_VERSION;
  if (asked === "minimum") {
    const { engines } = JSON.parse(readFileSync(join(extension, "package.json"), "utf8"));
    const oldest = /\d+\.\d+\.\d+/.exec(engines.vscode)?.[0];
    if (!oldest) throw new Error(`engines.vscode names no version: ${engines.vscode}`);
    return { version: oldest };
  }
  if (asked) return { version: asked };
  return existsSync(MAC_CODE) ? { vscodeExecutablePath: MAC_CODE } : {};
}

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
    lastFailure: {
      at: Date.now() - 4000,
      status: 500,
      message: "Payment declined",
      request: "req_9",
    },
  },
];
const findings = [
  {
    id: "err-timeout",
    severity: "error",
    title: "Timeout risk",
    description: "Calls take longer than most clients wait.",
    suggestion: "Add a timeout option to the endpoint.",
    endpoints: [{ source: "shop", endpoint: "orders.place", detail: "P95 = 6.4s" }],
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
const ANSWERS = {
  "/api/editor/calls": { calls },
  "/api/editor/endpoints": { endpoints: stats },
  "/api/editor/findings": { findings },
  "/api/editor/sites": { sites: [] },
};
const studio = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(ANSWERS[req.url] ?? {}));
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
writeFileSync(join(workspace, "courier.config.ts"), "export default {};\n");
writeFileSync(
  join(workspace, "src/cart.ts"),
  "// checkout\nawait api.orders.place({ sku: 'A' });\n",
);
const report = join(scratch, "report.json");

try {
  await runTests({
    ...editorToRun(),
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
