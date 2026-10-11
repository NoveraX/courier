import type * as vscode from "vscode";

import { courierLog } from "../log/courier-log";
import type { StudioTarget } from "../projects/studio-targets";
import type { CourierCore } from "./courier-core";

/**
 * Write to Courier's log which Studio each project runs, whenever that
 * changes: one starts, stops, or moves to another address.
 *
 * @param core - The extension's core
 * @returns What stops it
 * @example
 * ```ts
 * context.subscriptions.push(registerStudioLog(core));
 * ```
 */
export function registerStudioLog(core: CourierCore): vscode.Disposable {
  let said = new Map<string, string>();
  return core.onRedraw(async () => {
    const now = new Map(
      (await core.view.targets()).map((target) => [nameOf(target), target.studio ?? ""]),
    );
    for (const [name, studio] of now) {
      if (said.get(name) === studio) continue;
      courierLog().info(
        studio ? `${name}: Studio answers at ${studio}` : `${name}: no Studio running`,
      );
    }
    for (const name of said.keys()) {
      if (!now.has(name)) courierLog().info(`${name}: no longer in the workspace`);
    }
    said = now;
  });
}

function nameOf(target: StudioTarget): string {
  return target.project
    ? `${target.project.name} (${target.project.root})`
    : "The Studio the settings name";
}
