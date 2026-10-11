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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
const scratch = mkdtempSync(join(tmpdir(), "courier-vscode-editor-"));
/* The workspace by its path with links resolved, as Studio names the files it reads; the profile keeps the short one, as VS Code's socket path must stay under 104 characters. */
const workspace = join(realpathSync(scratch), "shop");
const definitions = [
  {
    source: "shop",
    endpoint: "orders.place",
    file: "src/api/orders.ts",
    path: join(workspace, "src/api/orders.ts"),
    line: 3,
    column: 5,
    endLine: 3,
    endColumn: 10,
    span: { line: 3, column: 5, endLine: 3, endColumn: 29 },
  },
];
const sites = [
  {
    file: "src/cart.ts",
    path: join(workspace, "src/cart.ts"),
    line: 2,
    column: 18,
    endLine: 2,
    endColumn: 23,
    code: "await api.orders.place({ sku: 'A' });",
  },
];
const groups = [
  {
    source: "shop",
    group: "orders",
    file: "src/api/orders.ts",
    path: join(workspace, "src/api/orders.ts"),
    open: { line: 2, column: 14 },
    close: { line: 4, column: 3 },
    last: { line: 3, column: 29, comma: true },
    names: ["place"],
    builder: "endpoint",
  },
];
const ANSWERS = {
  "/api/editor/groups": { groups },
  "/api/editor/endpoints": { endpoints: stats },
  "/api/editor/findings": { findings },
  "/api/editor/sites": { sites },
  "/api/editor/definitions": { definitions },
};
/* The calls are those of the checkout alone: the file that declares the endpoint calls none. */
const studio = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/editor/calls") {
      const { file } = JSON.parse(body || "{}");
      res.end(JSON.stringify({ calls: String(file).endsWith("cart.ts") ? calls : [] }));
      return;
    }
    res.end(JSON.stringify(ANSWERS[req.url] ?? {}));
  });
});
await new Promise((resolve) => studio.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${studio.address().port}`;

mkdirSync(join(workspace, ".courier"), { recursive: true });
mkdirSync(join(workspace, "src/api"), { recursive: true });
writeFileSync(
  join(workspace, ".courier/studio.json"),
  JSON.stringify({ url, pid: process.pid, version: "0.0.0" }),
);
writeFileSync(join(workspace, "courier.config.ts"), "export default {};\n");
writeFileSync(
  join(workspace, "src/cart.ts"),
  "// checkout\nawait api.orders.place({ sku: 'A' });\n",
);
writeFileSync(
  join(workspace, "src/api/orders.ts"),
  'export const orders = defineGroup({\n  endpoints: {\n    place: endpoint.post(""),\n  },\n});\n',
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
