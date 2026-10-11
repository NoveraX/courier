import { dirname } from "node:path";
import * as vscode from "vscode";

import { createCallHints } from "./hints/call-hints";
import { createHintStore } from "./hints/hint-store";
import { endpointPage } from "./hints/hint-text";
import { createConfiguredStudio } from "./studio/configured-studio";
import { findStudio } from "./studio/find-studio";
import { fetchCalls, fetchEndpointStats } from "./studio/studio-api";
import { createStudioStatus } from "./studio/studio-status";

const LANGUAGES = [
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
  "vue",
  "svelte",
  "astro",
];

/**
 * Start the extension: the hints over each endpoint call, kept up to date
 * while the window has focus; the Studio a file belongs to in the status
 * bar; and the commands that open an endpoint in Studio and bring the
 * hints up to date.
 *
 * @param context - The extension's context, which disposes what it holds
 * @example
 * ```ts
 * activate(context);
 * ```
 */
export function activate(context: vscode.ExtensionContext): void {
  const settings = () => vscode.workspace.getConfiguration("courier");
  const configured = createConfiguredStudio();
  const studioFor = async (file: string, workspace: string) =>
    configured() ?? findStudio(file, workspace);
  const store = createHintStore({
    findStudio: studioFor,
    fetchStats: fetchEndpointStats,
    fetchCalls,
  });
  const hints = createCallHints(store, () => settings().get<boolean>("hints.enabled", true));
  const status = createStudioStatus();
  const selector = LANGUAGES.map((language) => ({ language, scheme: "file" }));
  const showStatus = () =>
    void studioInFront(studioFor).then(async (studio) =>
      status.show(studio && (await store.answers(studio)) ? studio : undefined),
    );
  const restart = () => {
    store.forgetCalls();
    void store.refresh().finally(() => hints.refreshed());
    showStatus();
  };
  const addresses = vscode.workspace.createFileSystemWatcher("**/.courier/studio.json");
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, hints),
    vscode.languages.registerHoverProvider(selector, hints),
    vscode.commands.registerCommand(
      "courier.openInStudio",
      (studio?: string, source?: string, endpoint?: string) =>
        openInStudio(studioFor, studio, source, endpoint),
    ),
    vscode.commands.registerCommand("courier.refreshHints", restart),
    addresses,
    addresses.onDidCreate(restart),
    addresses.onDidChange(restart),
    addresses.onDidDelete(restart),
    vscode.window.onDidChangeActiveTextEditor(showStatus),
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration("courier")) restart();
    }),
    status,
    keepFresh(
      () => settings().get<number>("hints.refreshSeconds", 5),
      store.refresh,
      hints.refreshed,
    ),
  );
  showStatus();
}

/**
 * Stop the extension: everything it started is disposed with its context.
 */
export function deactivate(): void {}

type StudioFinder = (file: string, workspace: string) => Promise<string | undefined>;

async function studioInFront(studioFor: StudioFinder): Promise<string | undefined> {
  const document = vscode.window.activeTextEditor?.document;
  if (document?.uri.scheme !== "file") return undefined;
  const folder =
    vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? dirname(document.uri.fsPath);
  return studioFor(document.uri.fsPath, folder);
}

async function openInStudio(
  studioFor: StudioFinder,
  studio?: string,
  source?: string,
  endpoint?: string,
): Promise<void> {
  const address = studio ?? (await studioInFront(studioFor));
  if (!address) {
    void vscode.window.showInformationMessage(
      "Courier Studio is not running for this project: start it with `npx @noverax/courier-studio`.",
    );
    return;
  }
  const page = source && endpoint ? endpointPage(address, source, endpoint) : address;
  await vscode.env.openExternal(vscode.Uri.parse(page));
}

/* The figures move while the app runs: asked again every few seconds, only while the window has focus. */
function keepFresh(
  seconds: () => number,
  refresh: () => Promise<boolean>,
  refreshed: () => void,
): vscode.Disposable {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    if (vscode.window.state.focused && (await refresh())) refreshed();
    timer = setTimeout(tick, Math.max(2, seconds()) * 1000);
  };
  timer = setTimeout(tick, Math.max(2, seconds()) * 1000);
  return { dispose: () => clearTimeout(timer) };
}
