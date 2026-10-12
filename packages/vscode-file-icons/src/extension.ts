import * as vscode from "vscode";

import { closeIconsLog } from "./icons-log";
import { registerFileIcons } from "./register-file-icons";

/**
 * Start Courier File Icons: Courier's own icons for its config, its mocks
 * and the `.courier` folder in the icon themes that take custom icons,
 * offered once in a Courier project and kept as the user's settings say
 * from then on. It runs where the editor's window runs — on this computer
 * in a remote window too — beside the icon themes it puts the icons in,
 * and tells the Courier extension that its icon commands are there.
 *
 * @param context - The extension's context, which disposes what it holds
 * @example
 * ```ts
 * activate(context);
 * ```
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(registerFileIcons(context), { dispose: closeIconsLog });
  void vscode.commands.executeCommand("setContext", "courier.fileIconsReady", true);
}

/**
 * Stop the extension: everything it started is disposed with its context.
 */
export function deactivate(): void {}
