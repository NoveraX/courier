import { toast } from "sonner";

import { writeClipboardText } from "./write-clipboard-text";

/**
 * Copy text to the clipboard and say so; when it cannot be copied, say why
 * in an error toast instead of failing silently.
 *
 * @param text - The text to copy
 * @param label - What it is, for the toast ("snippet", "cURL")
 * @returns Resolves once the toast is shown; never rejects
 *
 * @example
 * ```ts
 * void copyToClipboard(snippet, "snippet");
 * ```
 */
export async function copyToClipboard(text: string, label: string): Promise<void> {
  try {
    await writeClipboardText(text);
    toast.success(`Copied ${label}`);
  } catch (err) {
    console.warn(`Copying the ${label} failed`, err);
    toast.error(err instanceof Error ? err.message : `Could not copy the ${label}`);
  }
}
