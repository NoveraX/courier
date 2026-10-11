import * as vscode from "vscode";

/** The one command a hover's links may run: open a page of Studio's. */
const LINK_COMMANDS = ["courier.openStudioPage"];

/**
 * Markdown the hints show — a hover, a tooltip — trusted to run the
 * command its Studio links name, and no other.
 *
 * @param text - The Markdown
 * @returns The Markdown, trusted for that command
 * @example
 * ```ts
 * new vscode.Hover(studioMarkdown(hoverText(stats, studio, Date.now())));
 * ```
 */
export function studioMarkdown(text: string): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString(text);
  markdown.isTrusted = { enabledCommands: LINK_COMMANDS };
  return markdown;
}
