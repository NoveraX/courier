import * as vscode from "vscode";

import { closeIconsLog } from "./icons-log";
import { type FileIconsRegistration, registerFileIcons } from "./register-file-icons";

let registration: FileIconsRegistration | undefined;

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
  registration = registerFileIcons(context);
  context.subscriptions.push(registration, { dispose: closeIconsLog });
  void vscode.commands.executeCommand("setContext", "courier.fileIconsReady", true);
}

/**
 * Stop the extension once the changes to the icons under way are made — a
 * theme's settings or icon files half written would outlast the window —
 * before VS Code disposes everything it started with its context.
 *
 * @returns Once those changes are made
 * @example
 * ```ts
 * await deactivate();
 * ```
 */
export async function deactivate(): Promise<void> {
  await registration?.settled();
  registration = undefined;
}
