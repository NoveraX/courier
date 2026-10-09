/*
 * Runs inside VS Code: opens the workspace's file, waits for the extension's
 * hints over its call, and checks the line above it and the hover over it.
 * What it saw is written to COURIER_EDITOR_REPORT; a mismatch fails the run.
 */
const assert = require("node:assert/strict");
const { writeFileSync } = require("node:fs");
const vscode = require("vscode");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function lensTitles(file) {
  for (let attempt = 0; attempt < 75; attempt++) {
    const lenses =
      (await vscode.commands.executeCommand("vscode.executeCodeLensProvider", file, 10)) ?? [];
    const titles = lenses.map((lens) => lens.command?.title).filter(Boolean);
    if (titles.length > 0) return { titles, lenses };
    await sleep(200);
  }
  return { titles: [], lenses: [] };
}

exports.run = async function run() {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
  assert.ok(folder, "VS Code opened no workspace");
  const file = vscode.Uri.joinPath(folder, "src/cart.ts");
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file));

  const { titles, lenses } = await lensTitles(file);
  const hovers =
    (await vscode.commands.executeCommand(
      "vscode.executeHoverProvider",
      file,
      new vscode.Position(1, 19),
    )) ?? [];
  const hover = hovers
    .flatMap((h) => h.contents)
    .map((content) => (typeof content === "string" ? content : content.value))
    .join("\n");
  const report = {
    version: vscode.version,
    titles,
    command: lenses[0]?.command?.command,
    arguments: lenses[0]?.command?.arguments,
    hover,
  };
  writeFileSync(process.env.COURIER_EDITOR_REPORT, JSON.stringify(report, null, 2));

  assert.deepEqual(titles, ["orders.place · 3 calls · 1 failed · p95 40 ms"]);
  assert.equal(report.command, "courier.openInStudio");
  assert.deepEqual(report.arguments, [process.env.COURIER_EDITOR_STUDIO, "shop", "orders.place"]);
  assert.match(hover, /3 calls, 1 failed/);
};
