import * as vscode from "vscode";

import { offerMcpServers } from "./agents/mcp-servers";
import { createAuditDiagnostics } from "./audit/audit-diagnostics";
import { createDefinitionStore } from "./code/definition-store";
import { registerCodeFeatures } from "./code/register-code-features";
import { openInStudio } from "./commands/open-in-studio";
import { setUpCourier, startStudio } from "./commands/project-commands";
import { createCallHints } from "./hints/call-hints";
import { CALL_LANGUAGES } from "./hints/hint-document";
import { createHintStore } from "./hints/hint-store";
import { keepFresh } from "./keep-fresh";
import { registerStudioPages } from "./panel/register-studio-panel";
import { createCourierProjects } from "./projects/courier-projects";
import { createConfiguredStudio } from "./studio/configured-studio";
import { findStudio } from "./studio/find-studio";
import { fetchCalls, fetchDefinitions, fetchEndpointStats, fetchSites } from "./studio/studio-api";
import { stateInFront } from "./studio/studio-in-front";
import { createStudioStatus } from "./studio/studio-status";
import { createCourierView } from "./view/courier-view";
import { registerViewCommands } from "./view/view-commands";

/**
 * Start the extension: the hints over each endpoint call and the audit's
 * findings at them, kept up to date while the window has focus; going from
 * a call to its endpoint's declaration and back, with the figures over each
 * declaration; the Courier view of each project's endpoints; Studio in a
 * tab of the editor's own; the Studio of the file in front in the status
 * bar; the commands that start Studio and set Courier up; and the MCP
 * servers offered to VS Code's agent.
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
  const answers = async (studio: string) =>
    store.statsFor(studio) !== undefined || store.answers(studio);
  const projects = createCourierProjects();
  const hints = createCallHints(store, () => settings().get<boolean>("hints.enabled", true));
  const view = createCourierView({
    projects: projects.list,
    configured,
    statsFor: store.statsFor,
    answers: store.answers,
    fetchSites,
  });
  const diagnostics = createAuditDiagnostics(store, () =>
    settings().get<boolean>("audit.diagnostics", true),
  );
  const status = createStudioStatus();
  const selector = CALL_LANGUAGES.map((language) => ({ language, scheme: "file" }));
  const definitions = createDefinitionStore(fetchDefinitions);
  const code = registerCodeFeatures({
    selector,
    store,
    definitions,
    fetchSites,
    targets: view.targets,
    enabled: () => settings().get<boolean>("hints.enabled", true),
  });
  const pages = registerStudioPages({
    extensionUri: context.extensionUri,
    studioFor,
    answers,
    targets: view.targets,
  });
  const showStatus = () =>
    void stateInFront({ studioFor, projects, answers, targets: view.targets }).then(status.show);
  const redraw = () => {
    hints.refreshed();
    code.refreshed();
    void view.refresh().then(showStatus);
    void diagnostics.refresh();
  };
  const restart = () => {
    store.forgetCalls();
    definitions.forget();
    void store.refresh().finally(redraw);
    void pages.refresh();
  };
  const addresses = vscode.workspace.createFileSystemWatcher("**/.courier/studio.json");
  context.subscriptions.push(
    projects,
    view,
    code,
    pages,
    diagnostics,
    status,
    addresses,
    vscode.languages.registerCodeLensProvider(selector, hints),
    vscode.languages.registerHoverProvider(selector, hints),
    vscode.commands.registerCommand(
      "courier.openInStudio",
      (studio?: string, source?: string, endpoint?: string) =>
        openInStudio(studioFor, projects, { studio, source, endpoint }, pages.open),
    ),
    vscode.commands.registerCommand("courier.refreshHints", restart),
    vscode.commands.registerCommand("courier.startStudio", (root?: string) =>
      startStudio(projects, typeof root === "string" ? root : undefined),
    ),
    vscode.commands.registerCommand("courier.setUp", setUpCourier),
    registerViewCommands(projects, view.refresh, pages.open),
    offerMcpServers(projects, () => settings().get<boolean>("agents.mcpServers", true)),
    addresses.onDidCreate(restart),
    addresses.onDidChange(restart),
    addresses.onDidDelete(restart),
    projects.onDidChange(restart),
    vscode.window.onDidChangeActiveTextEditor(showStatus),
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration("courier")) restart();
    }),
    keepFresh(() => settings().get<number>("hints.refreshSeconds", 5), store.refresh, redraw),
  );
  restart();
}

/**
 * Stop the extension: everything it started is disposed with its context.
 */
export function deactivate(): void {}
