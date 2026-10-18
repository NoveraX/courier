import { toast } from "sonner";

import { callsAndRequests } from "@/features/requests/own-requests";
import { post } from "@/lib/api-client";
import { isPlainObject } from "@/socket/is-plain-object";
import { showSavedSession } from "./show-saved-session";

/* The most Studio reads in one request; a larger file could never be opened. */
const LARGEST_FILE = 64 * 1024 * 1024;

/**
 * Open a session file a colleague saved: Studio keeps it as a session of
 * its own and the page shows it in place of the live requests — read-only,
 * since nothing runs again while a saved session shows. A file that is not
 * a session file, or one Studio refuses, says why in a toast.
 *
 * @param file - The file picked or dropped
 * @returns Whether it opened
 * @example
 * ```ts
 * await openSessionFile(input.files[0]);
 * ```
 */
export async function openSessionFile(file: File): Promise<boolean> {
  if (file.size > LARGEST_FILE) {
    toast.error(`${file.name} is larger than the 64 MB a session file can be`);
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    toast.error(`${file.name} is not JSON, so it is not a session file`);
    return false;
  }
  try {
    const opened = await post<unknown>("/api/sessions/import", { file: parsed });
    if (!isPlainObject(opened) || typeof opened.id !== "string") {
      throw new Error("Studio kept no session");
    }
    const shown = await showSavedSession(opened.id);
    if (!shown) throw new Error("Studio sent no session");
    toast.success(
      `Opened ${file.name}: ${callsAndRequests(shown.calls, shown.requests)}; recording paused`,
    );
    return true;
  } catch (error) {
    toast.error(
      `Could not open ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Ask for a session file, as a file picker does, and open the one chosen.
 *
 * @example
 * ```ts
 * pickSessionFile();
 * ```
 */
export function pickSessionFile(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void openSessionFile(file);
  });
  input.click();
}
