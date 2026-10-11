/*
 * Runs inside VS Code: opens the workspace's file, waits for the extension's
 * hints over its call, and checks the line above it, the hover over it, the
 * audit's finding marked at it, going to the endpoint's declaration and
 * back, the lines over the declaration, the endpoint in Go to Symbol, the
 * commands the extension offers and its snippets. What it saw is written to
 * COURIER_EDITOR_REPORT; a mismatch fails the run.
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

async function auditMarks(file) {
  for (let attempt = 0; attempt < 75; attempt++) {
    const marks = vscode.languages
      .getDiagnostics(file)
      .filter((diagnostic) => diagnostic.source === "Courier audit");
    if (marks.length > 0) return marks;
    await sleep(200);
  }
  return [];
}

async function snippetLabels() {
  const document = await vscode.workspace.openTextDocument({
    language: "typescript",
    content: "courier-",
  });
  const list = await vscode.commands.executeCommand(
    "vscode.executeCompletionItemProvider",
    document.uri,
    new vscode.Position(0, 8),
  );
  return (list?.items ?? [])
    .map((item) => (typeof item.label === "string" ? item.label : item.label.label))
    .filter((label) => label.startsWith("courier-"))
    .sort();
}

async function codeFeatures(folder, file) {
  const orders = vscode.Uri.joinPath(folder, "src/api/orders.ts");
  await vscode.workspace.openTextDocument(orders);
  const run = (command, ...args) => vscode.commands.executeCommand(command, ...args);
  const found =
    (await run("vscode.executeDefinitionProvider", file, new vscode.Position(1, 19))) ?? [];
  const references =
    (await run("vscode.executeReferenceProvider", orders, new vscode.Position(2, 6))) ?? [];
  const lenses = (await run("vscode.executeCodeLensProvider", orders, 10)) ?? [];
  const symbols = (await run("vscode.executeWorkspaceSymbolProvider", "ordpl")) ?? [];
  return {
    definitions: found.map((each) => (each.targetUri ?? each.uri).fsPath),
    references: references.map((each) => `${each.uri.fsPath}:${each.range.start.line + 1}`),
    declarationLenses: lenses.map((lens) => lens.command?.title).filter(Boolean),
    symbols: symbols.map((each) => each.name),
    ordersPath: orders.fsPath,
  };
}

async function studioTab() {
  await vscode.commands.executeCommand(
    "courier.openStudioPage",
    `${process.env.COURIER_EDITOR_STUDIO}/audit`,
  );
  for (let attempt = 0; attempt < 50; attempt++) {
    const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
    const studio = tabs.find(
      (tab) =>
        tab.input instanceof vscode.TabInputWebview &&
        tab.input.viewType.endsWith("courier.studio"),
    );
    if (studio) return studio.label;
    await sleep(100);
  }
  return undefined;
}

async function addedEndpoint(folder) {
  const orders = vscode.Uri.joinPath(folder, "src/api/orders.ts");
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(orders));
  await vscode.commands.executeCommand("courier.newEndpoint", {
    source: "shop",
    group: "orders",
    name: "cancel",
    method: "post",
    path: ":id/cancel",
  });
  const document = await vscode.workspace.openTextDocument(orders);
  return document.lineAt(3).text;
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
  const marks = await auditMarks(file);
  const commands = (await vscode.commands.getCommands(true)).filter((name) =>
    name.startsWith("courier."),
  );
  const report = {
    version: vscode.version,
    titles,
    command: lenses[0]?.command?.command,
    arguments: lenses[0]?.command?.arguments,
    hover,
    marks: marks.map((mark) => ({
      message: mark.message,
      severity: mark.severity,
      line: mark.range.start.line,
      code: typeof mark.code === "object" ? String(mark.code.target) : mark.code,
    })),
    commands,
    snippets: await snippetLabels(),
    code: await codeFeatures(folder, file),
    panel: await studioTab(),
    added: await addedEndpoint(folder),
    tasks: (await vscode.tasks.fetchTasks({ type: "courier" })).map((task) => task.name),
  };
  writeFileSync(process.env.COURIER_EDITOR_REPORT, JSON.stringify(report, null, 2));

  assert.deepEqual(titles, ["orders.place · 3 calls · 1 failed · p95 40 ms"]);
  assert.equal(report.command, "courier.openInStudio");
  assert.deepEqual(report.arguments, [process.env.COURIER_EDITOR_STUDIO, "shop", "orders.place"]);
  assert.match(hover, /3 calls, 1 failed/);
  const studioLink = (page) =>
    `command:courier.openStudioPage?${encodeURIComponent(JSON.stringify([page]))}`;
  assert.ok(
    hover.includes(
      `[Open the latest failure](${studioLink(`${process.env.COURIER_EDITOR_STUDIO}/timeline?req=req_9`)})`,
    ),
    "the hover links the latest failure to Studio's inspector",
  );
  assert.ok(report.panel, "Studio's page opens in a tab of the editor's own");
  assert.deepEqual(report.marks, [
    {
      message: "Timeout risk — P95 = 6.4s. Add a timeout option to the endpoint.",
      severity: vscode.DiagnosticSeverity.Warning,
      line: 1,
      code: `${process.env.COURIER_EDITOR_STUDIO}/audit`,
    },
  ]);
  for (const name of ["courier.startStudio", "courier.setUp", "courier.view.openLatestFailure"]) {
    assert.ok(commands.includes(name), `${name} is registered`);
  }
  const { code } = report;
  assert.deepEqual(
    code.definitions,
    [code.ordersPath],
    "a call goes to its endpoint's declaration",
  );
  assert.deepEqual(
    code.references,
    [`${code.ordersPath}:3`, `${file.fsPath}:2`],
    "the declaration lists itself and its call site, once each",
  );
  assert.deepEqual(code.declarationLenses, ["3 calls · 1 failed · p95 40 ms", "1 call site"]);
  assert.deepEqual(code.symbols, ["orders.place"]);
  assert.equal(
    report.added,
    '    cancel: endpoint.post(":id/cancel").variables<{ id: string }>().response<unknown>(),',
    "a new endpoint goes after the group's last, its variables and response to fill in",
  );
  assert.deepEqual(report.tasks, ["studio", "verify", "openapi", "diff", "agents"]);
  assert.deepEqual(report.snippets, [
    "courier-api",
    "courier-boundary",
    "courier-call",
    "courier-channel",
    "courier-endpoint",
    "courier-group",
    "courier-mutation",
    "courier-query",
    "courier-subscription",
  ]);
};
