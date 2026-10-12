import { Code, Download, FileJson, Terminal } from "lucide-react";

import type { OverflowAction } from "@/design/overflow-menu";
import { endpointName } from "@/features/requests/request-parts";
import { requestAsJson, requestSnippet } from "@/features/requests/request-snippets";
import { copyToClipboard } from "@/lib/clipboard";
import { downloadFile } from "@/lib/export";
import type { RequestEntry } from "@/store/types";

/**
 * The ways to take a request elsewhere: copy it as a cURL command, as a
 * browser's `fetch` call or as JSON, or download the JSON. A row's menu
 * offers them, and so does the inspector's "⋯" menu, where a finger with no
 * right click finds them.
 *
 * @param request - The request
 * @returns The actions, in the menus' order
 * @example
 * ```ts
 * requestCopyActions(request).map((a) => a.label);
 * // ["Copy as cURL", "Copy as fetch", "Copy as JSON", "Download JSON"]
 * ```
 */
export function requestCopyActions(
  request: RequestEntry,
): [OverflowAction, OverflowAction, OverflowAction, OverflowAction] {
  const json = () => requestAsJson(request);
  return [
    {
      key: "curl",
      label: "Copy as cURL",
      icon: Terminal,
      onSelect: () => void copyToClipboard(requestSnippet(request, "shell").code, "as cURL"),
    },
    {
      key: "fetch",
      label: "Copy as fetch",
      icon: Code,
      onSelect: () => void copyToClipboard(requestSnippet(request, "browser").code, "as fetch"),
    },
    {
      key: "json",
      label: "Copy as JSON",
      icon: FileJson,
      onSelect: () => void copyToClipboard(json(), "as JSON"),
    },
    {
      key: "download",
      label: "Download JSON",
      icon: Download,
      onSelect: () => downloadFile(json(), `${endpointName(request)}-${request.id}.json`),
    },
  ];
}
