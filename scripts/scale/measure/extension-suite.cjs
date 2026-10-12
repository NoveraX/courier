/*
 * Runs inside VS Code, over the enterprise project with Studio running for
 * it: opens files that call the API, as a developer opens them, and times
 * how soon the editor shows Courier's hints over their calls — the first
 * file, while the extension starts, and the next ones — and going from a
 * call to the endpoint's declaration. Writes what it saw to
 * COURIER_SCALE_REPORT.
 */
const { writeFileSync } = require("node:fs");
const vscode = require("vscode");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* How long until the file shows hints over its calls, and how many. */
async function hintsOf(uri) {
  const begun = Date.now();
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
  for (let attempt = 0; attempt < 300; attempt++) {
    const lenses =
      (await vscode.commands.executeCommand("vscode.executeCodeLensProvider", uri, 50)) ?? [];
    const titled = lenses.filter((lens) => lens.command?.title);
    if (titled.length > 0) return { ms: Date.now() - begun, hints: titled.length, lenses };
    await sleep(100);
  }
  return { ms: Number.NaN, hints: 0, lenses: [] };
}

async function definitionOf(uri, lens) {
  const begun = Date.now();
  const found =
    (await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      uri,
      lens.range.end,
    )) ?? [];
  return { ms: Date.now() - begun, found: found.length };
}

exports.run = async function run() {
  const [folder] = vscode.workspace.workspaceFolders ?? [];
  if (!folder) throw new Error("VS Code opened no folder");
  const files = await vscode.workspace.findFiles("src/app/**/*.ts", "**/node_modules/**", 40);
  files.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
  const first = await hintsOf(files[0]);
  const next = [];
  for (const uri of files.slice(1, 11)) next.push(await hintsOf(uri));
  const lens = first.lenses.find((each) => each.command?.title);
  const definition = lens ? await definitionOf(files[0], lens) : { ms: Number.NaN, found: 0 };
  const memory = process.memoryUsage();
  writeFileSync(
    process.env.COURIER_SCALE_REPORT,
    JSON.stringify({
      files: files.length,
      first: { ms: first.ms, hints: first.hints },
      next: next.map(({ ms, hints }) => ({ ms, hints })),
      definition,
      hostHeapMb: memory.heapUsed / 2 ** 20,
      hostRssMb: memory.rss / 2 ** 20,
    }),
  );
};
