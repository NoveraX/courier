import * as vscode from "vscode";

import type { CourierProject } from "../projects/courier-projects";

/** What the status bar says about the project of the file in front. */
export type StudioState =
  | { readonly studio: string }
  | { readonly stopped: CourierProject }
  | undefined;

/** The status bar item for the Studio of the file in front. */
export interface StudioStatus extends vscode.Disposable {
  show(state: StudioState): void;
}

/**
 * The status bar item for the project of the file in front: **Studio** while
 * its Studio answers, a click opening it; **Start Studio** for a Courier
 * project whose Studio does not run, a click starting it; nothing for a file
 * outside any Courier project.
 *
 * @returns The item, hidden until shown
 * @example
 * ```ts
 * const status = createStudioStatus();
 * status.show({ studio: "http://localhost:6280" });
 * ```
 */
export function createStudioStatus(): StudioStatus {
  const item = vscode.window.createStatusBarItem(
    "courier.studio",
    vscode.StatusBarAlignment.Right,
    100,
  );
  item.name = "Courier Studio";
  return {
    show(state) {
      if (!state) {
        item.hide();
        return;
      }
      if ("studio" in state) {
        item.text = "$(pulse) Studio";
        item.tooltip = `Courier Studio runs at ${state.studio}: open it`;
        item.command = "courier.openInStudio";
      } else {
        item.text = "$(play) Start Studio";
        item.tooltip = `Courier Studio is not running for ${state.stopped.name}: start it`;
        item.command = {
          title: "Start Courier Studio",
          command: "courier.startStudio",
          arguments: [state.stopped.root],
        };
      }
      item.show();
    },
    dispose: () => item.dispose(),
  };
}
