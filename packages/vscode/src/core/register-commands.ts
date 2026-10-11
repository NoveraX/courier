import * as vscode from "vscode";

import { openInStudio } from "../commands/open-in-studio";
import { setUpCourier, startStudio } from "../commands/project-commands";
import { registerViewCommands } from "../view/view-commands";
import type { CourierCore } from "./courier-core";

/**
 * The commands that open Studio where the settings say, start it, set
 * Courier up, and act on the Courier view's rows.
 *
 * @param core - The extension's core
 * @returns What unregisters them
 * @example
 * ```ts
 * context.subscriptions.push(registerCommands(core));
 * ```
 */
export function registerCommands(core: CourierCore): vscode.Disposable {
  const { studioFor, projects, pages } = core;
  return vscode.Disposable.from(
    vscode.commands.registerCommand(
      "courier.openInStudio",
      (studio?: string, source?: string, endpoint?: string) =>
        openInStudio(studioFor, projects, { studio, source, endpoint }, pages.open),
    ),
    vscode.commands.registerCommand("courier.startStudio", (root?: string) =>
      startStudio(projects, typeof root === "string" ? root : undefined),
    ),
    vscode.commands.registerCommand("courier.setUp", setUpCourier),
    registerViewCommands(projects, core.view.refresh, pages.open),
  );
}
