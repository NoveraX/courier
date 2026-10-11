import * as vscode from "vscode";

import { stateInFront } from "../studio/studio-in-front";
import { createStudioStatus } from "../studio/studio-status";
import type { CourierCore } from "./courier-core";

/**
 * The status bar item for the project of the file in front: Studio while
 * it answers, Start Studio while it does not — said again whenever the file
 * in front changes or the Studios do.
 *
 * @param core - The extension's core
 * @returns What removes it
 * @example
 * ```ts
 * context.subscriptions.push(registerStatus(core));
 * ```
 */
export function registerStatus(core: CourierCore): vscode.Disposable {
  const status = createStudioStatus();
  const { studioFor, projects, answers } = core;
  const show = () =>
    void stateInFront({ studioFor, projects, answers, targets: core.view.targets }).then(
      status.show,
    );
  return vscode.Disposable.from(
    status,
    core.onRedraw(show),
    vscode.window.onDidChangeActiveTextEditor(show),
  );
}
