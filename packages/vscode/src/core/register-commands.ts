import * as vscode from "vscode";

import { openInStudio } from "../commands/open-in-studio";
import { setUpCourier, startStudio } from "../commands/project-commands";
import { type NewEndpointArgs, newEndpoint } from "../generate/new-endpoint";
import { registerViewCommands } from "../view/view-commands";
import type { CourierCore } from "./courier-core";

/**
 * The commands that open Studio where the settings say, start it, set
 * Courier up, add an endpoint to a group, and act on the Courier view's
 * rows.
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
    vscode.commands.registerCommand("courier.newEndpoint", (known?: unknown) =>
      newEndpoint(
        { studioFor, targets: core.view.targets, fetchGroups: core.reads.fetchGroups },
        argsOf(known),
      ),
    ),
    registerViewCommands(projects, core.view.refresh, pages.open),
  );
}

/* What a caller already knows of the endpoint to add — another command, a row of the view — read as data. */
function argsOf(known: unknown): NewEndpointArgs {
  if (typeof known !== "object" || known === null) return {};
  const text = (key: string) => {
    const value: unknown = Reflect.get(known, key);
    return typeof value === "string" ? value : undefined;
  };
  const method = text("method");
  const methods = ["get", "post", "put", "patch", "del", "query"] as const;
  return {
    source: text("source"),
    group: text("group"),
    name: text("name"),
    method: methods.find((each) => each === method),
    path: text("path"),
  };
}
