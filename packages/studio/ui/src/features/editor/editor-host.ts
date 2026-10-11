/** What Studio tells the editor it shows inside of: open a file at a place, or a page outside; which page it shows. */
export type EditorHostMessage =
  | {
      readonly source: "courier-studio";
      readonly type: "open-file";
      readonly path: string;
      readonly line: number;
      readonly column: number;
    }
  | { readonly source: "courier-studio"; readonly type: "open-external"; readonly url: string }
  | { readonly source: "courier-studio"; readonly type: "location"; readonly path: string };

/**
 * Whether Studio shows inside an editor's own tab — VS Code's Courier
 * extension, or an editor built on VS Code — rather than in a browser:
 * only those may frame it, so a page in a frame is one of theirs.
 *
 * @returns Whether it shows inside an editor
 * @example
 * ```ts
 * insideEditor(); // false in a browser tab
 * ```
 */
export function insideEditor(): boolean {
  return typeof window !== "undefined" && window.self !== window.top;
}

/**
 * Ask the editor Studio shows inside of to do what a link would: open a
 * file at a line and column, or a page in the browser. The editor is the
 * one that framed Studio; what it is told names no secret.
 *
 * @param message - What to open
 * @example
 * ```ts
 * askEditorHost({ source: "courier-studio", type: "open-file", path, line: 12, column: 9 });
 * ```
 */
export function askEditorHost(message: EditorHostMessage): void {
  window.parent.postMessage(message, "*");
}
