import { askEditorHost, insideEditor } from "@/features/editor/editor-host";

/**
 * Open a page outside Studio, in a new tab — or, inside an editor's own
 * tab, in the browser the editor opens it in, since a frame opens no
 * window of its own.
 *
 * @param url - The page
 * @example
 * ```ts
 * openOutside(DOCS_URL);
 * ```
 */
export function openOutside(url: string): void {
  if (insideEditor()) {
    askEditorHost({ source: "courier-studio", type: "open-external", url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
