/**
 * Put text on the clipboard. Browsers offer the clipboard API only on a
 * secure page — https, or localhost — and Studio may be opened over http
 * from another address on the network, where `navigator.clipboard` does not
 * exist. There, and when the API refuses, the text is copied through a
 * selection instead (`document.execCommand("copy")`).
 *
 * @param text - The text to copy
 * @returns Resolves once the text is on the clipboard
 * @throws Error saying why copying failed and to select the text instead,
 *   when neither way works
 *
 * @example
 * ```ts
 * await writeClipboardText(snippet);
 * ```
 */
export async function writeClipboardText(text: string): Promise<void> {
  const clipboard: Clipboard | undefined = globalThis.navigator?.clipboard;
  let refusal: unknown = null;
  if (clipboard && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(text);
      return;
    } catch (err) {
      refusal = err;
    }
  }
  if (copyThroughSelection(text)) return;
  const reason =
    refusal === null
      ? "Copying needs a secure page (https or localhost)"
      : `The browser refused to copy (${refusal instanceof Error ? refusal.message : String(refusal)})`;
  throw new Error(`${reason}. Select the text and copy it with the keyboard instead.`, {
    cause: refusal,
  });
}

/* Inside a modal dialog focus may not leave it, and a selection that loses
   focus copies nothing: the text to copy goes where focus is, and focus
   returns to where it was. */
function copyThroughSelection(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  const previous = document.activeElement;
  const host = previous?.closest("[role=dialog]") ?? document.body;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  host.appendChild(area);
  area.focus({ preventScroll: true });
  area.select();
  try {
    return document.execCommand("copy");
  } catch (err) {
    console.warn("Copying through a selection failed", err);
    return false;
  } finally {
    area.remove();
    if (previous && "focus" in previous && typeof previous.focus === "function") previous.focus();
  }
}
