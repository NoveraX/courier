import type { CodeEditor } from "@/store/types-ui";

/* The address each editor opens a file at a line by, once it is installed. */
const FILE_SCHEMES: Readonly<Partial<Record<CodeEditor, string>>> = {
  vscode: "vscode://file",
  cursor: "cursor://file",
  windsurf: "windsurf://file",
  vscodium: "vscodium://file",
  zed: "zed://file",
};
const OPEN_SCHEMES: Readonly<Partial<Record<CodeEditor, string>>> = {
  webstorm: "webstorm://open",
  idea: "idea://open",
};

/**
 * The address that opens a file at a line and column in an editor — which
 * the browser hands to the editor installed for it — or `undefined` when
 * Studio is set to open none.
 *
 * @param editor - The editor chosen in Settings
 * @param path - The file's absolute path
 * @param line - The line, from 1
 * @param column - The column, from 1
 * @returns The address, or `undefined`
 * @example
 * ```ts
 * editorLink("vscode", "/work/shop/src/cart.ts", 12, 9); // "vscode://file/work/shop/src/cart.ts:12:9"
 * ```
 */
export function editorLink(
  editor: CodeEditor,
  path: string,
  line: number,
  column: number,
): string | undefined {
  const forward = path.replaceAll("\\", "/");
  const rooted = forward.startsWith("/") ? forward : `/${forward}`;
  const file = FILE_SCHEMES[editor];
  if (file) return `${file}${encodeURI(rooted)}:${line}:${column}`;
  const open = OPEN_SCHEMES[editor];
  if (!open) return undefined;
  return `${open}?file=${encodeURIComponent(forward)}&line=${line}&column=${column}`;
}
