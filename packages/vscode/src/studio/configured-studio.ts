import * as vscode from "vscode";

import { isLocalStudio } from "./local-address";

/**
 * The Studio the `courier.studio.url` setting names — for a project outside
 * the workspace — when it is on this machine. The extension sends Studio
 * the text of the files you open, so an address elsewhere is ignored, and
 * said so once.
 *
 * @returns What reads the setting
 * @example
 * ```ts
 * const configured = createConfiguredStudio();
 * configured(); // "http://localhost:6280", or undefined
 * ```
 */
export function createConfiguredStudio(): () => string | undefined {
  const warned = new Set<string>();
  return () => {
    const url = vscode.workspace.getConfiguration("courier").get<string>("studio.url")?.trim();
    if (!url) return undefined;
    if (isLocalStudio(url)) return url;
    if (!warned.has(url)) {
      warned.add(url);
      void vscode.window.showWarningMessage(
        `Courier ignores courier.studio.url: ${url} is not on this machine, and the extension sends Studio the text of the files you open. Name a Studio on localhost.`,
      );
    }
    return undefined;
  };
}
