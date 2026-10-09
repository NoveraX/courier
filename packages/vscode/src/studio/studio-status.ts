import * as vscode from "vscode";

/** The item in the status bar that says whether a Studio runs for the file in front. */
export interface StudioStatus extends vscode.Disposable {
  /** Show the Studio the file in front belongs to, or hide the item when none runs */
  show(studio: string | undefined): void;
}

/**
 * The status bar item for Courier Studio: shown while the file in front
 * belongs to a project whose Studio runs, a click opening Studio.
 *
 * @returns The item
 * @example
 * ```ts
 * const status = createStudioStatus();
 * status.show("http://localhost:6280");
 * ```
 */
export function createStudioStatus(): StudioStatus {
  const item = vscode.window.createStatusBarItem(
    "courier.studio",
    vscode.StatusBarAlignment.Right,
    100,
  );
  item.name = "Courier Studio";
  item.command = "courier.openInStudio";
  return {
    show(studio) {
      if (!studio) {
        item.hide();
        return;
      }
      item.text = "$(pulse) Studio";
      item.tooltip = `Courier Studio runs at ${studio}: open it`;
      item.show();
    },
    dispose: () => item.dispose(),
  };
}
