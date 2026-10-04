import { toast } from "sonner";

import { apiClient } from "@/lib/api-client";
import { downloadFile } from "@/lib/export";
import { useStudioStore } from "@/store";
import type { ExportFormat } from "@/store/types";
import { savedRequestOf } from "./saved-request";

const EXTENSION: Readonly<Record<ExportFormat, string>> = {
  har: "har",
  json: "json",
  postman: "postman_collection.json",
};

function stamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * Download the requests the page shows, in the format Studio's settings
 * name: the saved session's export while one is shown, else the live
 * requests', which Studio builds as a save would — credentials left out —
 * and keeps nowhere. A failure says why in a toast.
 *
 * @param format - HAR, JSON or a Postman collection
 * @param now - The time, for the file's name
 * @returns Whether the file was downloaded
 * @example
 * ```ts
 * await exportShownRequests(useStudioStore.getState().settings.defaultExportFormat);
 * ```
 */
export async function exportShownRequests(
  format: ExportFormat,
  now = new Date(),
): Promise<boolean> {
  const { requests, shownSession } = useStudioStore.getState();
  const request = shownSession
    ? apiClient.post<Blob>("/api/sessions/export", {
        json: { id: shownSession.id, format },
        responseType: "blob",
      })
    : apiClient.post<Blob>("/api/sessions/export-live", {
        json: { requests: requests.map(savedRequestOf), format },
        responseType: "blob",
      });
  try {
    const blob = await request;
    const name = shownSession ? `session-${shownSession.id}` : `courier-requests-${stamp(now)}`;
    downloadFile(blob, `${name}.${EXTENSION[format]}`);
    toast.success(
      `Exported ${shownSession ? "the session" : `${requests.length} requests`} as ${format.toUpperCase()}`,
    );
    return true;
  } catch (error) {
    toast.error(
      `Could not export the requests: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}
