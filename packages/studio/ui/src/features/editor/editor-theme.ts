import { insideEditor } from "./editor-host";

/** A theme an editor asks Studio to show in its own tab. */
export type EditorTheme = "dark" | "light";

/**
 * The theme the editor framing Studio asked for in the link it opened —
 * `#theme=dark` — so that Studio's first paint in the editor's tab matches
 * the editor around it. A page in a browser tab keeps its own.
 *
 * @returns The theme asked for, or `undefined` outside an editor or when none was
 * @example
 * ```ts
 * applyTheme(editorThemeInLink() ?? settings.theme);
 * ```
 */
export function editorThemeInLink(): EditorTheme | undefined {
  if (!insideEditor()) return undefined;
  const asked = new URLSearchParams(location.hash.slice(1)).get("theme");
  return isEditorTheme(asked) ? asked : undefined;
}

/**
 * Whether a value names a theme an editor may ask for.
 *
 * @param value - The value
 * @returns Whether it is `dark` or `light`
 * @example
 * ```ts
 * isEditorTheme("dark"); // true
 * ```
 */
export function isEditorTheme(value: unknown): value is EditorTheme {
  return value === "dark" || value === "light";
}
