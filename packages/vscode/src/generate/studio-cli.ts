import * as vscode from "vscode";

import type { CourierProject } from "../projects/courier-projects";

/**
 * A word for the shell the terminal runs, as one argument whatever it holds:
 * single quotes on macOS and Linux, double quotes on Windows.
 *
 * @param word - The word
 * @param platform - The platform the terminal runs on
 * @returns The word, quoted
 * @example
 * ```ts
 * shellWord("https://api.example/openapi.json?v=1"); // "'https://api.example/openapi.json?v=1'"
 * ```
 */
export function shellWord(word: string, platform: NodeJS.Platform = process.platform): string {
  if (/^[\w@%+=:,./-]+$/.test(word)) return word;
  if (platform === "win32") return `"${word.replace(/"/g, '""')}"`;
  return `'${word.replace(/'/g, "'\\''")}'`;
}

/**
 * Run one of Courier Studio's commands for a project in a terminal of its
 * own — by the package's full name, so npx runs the project's own copy —
 * where it shows its plan and asks before it writes.
 *
 * @param project - The project, whose folder the command runs in
 * @param title - The terminal's name
 * @param args - The command and its arguments: `["import", spec]`
 * @example
 * ```ts
 * runStudioCommand(project, "Import API", ["import", "https://api.example/openapi.json"]);
 * ```
 */
export function runStudioCommand(
  project: CourierProject,
  title: string,
  args: readonly string[],
): void {
  const terminal = vscode.window.createTerminal({
    name: `${title} · ${project.name}`,
    cwd: project.root,
    iconPath: new vscode.ThemeIcon("terminal"),
  });
  terminal.sendText(
    ["npx", "@noverax/courier-studio", ...args].map((word) => shellWord(word)).join(" "),
  );
  terminal.show();
}
