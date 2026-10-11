import * as vscode from "vscode";

import { offerMcpServers } from "./agents/mcp-servers";
import { registerChat } from "./chat/register-chat";
import { registerCodeFeatures } from "./code/register-code-features";
import { createCourierCore } from "./core/courier-core";
import { registerCommands } from "./core/register-commands";
import { registerEditorMarks } from "./core/register-editor-marks";
import { registerStatus } from "./core/register-status";
import { registerStudioLog } from "./core/register-studio-log";
import { registerWorkflows } from "./core/register-workflows";
import { registerCliCommands } from "./generate/cli-commands";
import { registerLiveViews } from "./live/register-live-views";
import { closeCourierLog, courierLog } from "./log/courier-log";
import { fetchSites } from "./studio/studio-api";

/**
 * Start the extension: the hints over each endpoint call and the audit's
 * findings at them, kept up to date while the window has focus; going from
 * a call to its endpoint's declaration and back, with the figures over each
 * declaration; the Courier views of each project's endpoints, the requests
 * Studio records and the mocks it runs; Studio in a tab of the editor's
 * own; the Studio of the file in front in the status bar; the commands
 * that start Studio, set Courier up, add an endpoint, import an API and
 * check what a change breaks; Courier's tasks, and the recorded calls in
 * the Test Explorer; `@courier` in the chat; Courier's log in the Output
 * panel; and the MCP servers offered to VS Code's agent.
 *
 * @param context - The extension's context, which disposes what it holds
 * @example
 * ```ts
 * activate(context);
 * ```
 */
export function activate(context: vscode.ExtensionContext): void {
  const core = createCourierCore(context);
  const code = registerCodeFeatures({
    selector: core.selector,
    store: core.store,
    definitions: core.definitions,
    fetchSites,
    targets: core.view.targets,
    enabled: () => core.settings().get<boolean>("hints.enabled", true),
  });
  context.subscriptions.push(
    core,
    code,
    core.onRedraw(code.refreshed),
    registerEditorMarks(core),
    registerStatus(core),
    registerCommands(core),
    registerLiveViews(core),
    registerCliCommands(core),
    registerWorkflows(core),
    registerChat(core),
    registerStudioLog(core),
    vscode.commands.registerCommand("courier.showLog", () => courierLog().show()),
    { dispose: closeCourierLog },
    offerMcpServers(core.projects, () => core.settings().get<boolean>("agents.mcpServers", true)),
  );
  core.start();
}

/**
 * Stop the extension: everything it started is disposed with its context.
 */
export function deactivate(): void {}
