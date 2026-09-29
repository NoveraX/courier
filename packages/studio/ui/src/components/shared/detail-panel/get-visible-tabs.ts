import type { RequestEntry } from "@/store/types";
import { DETAIL_TABS } from "./constants";

export function getVisibleTabs(request: RequestEntry): (typeof DETAIL_TABS)[number][] {
  const isStream = request.transport === "sse" || request.transport === "ws";
  return DETAIL_TABS.filter((tab) => {
    if (tab.key === "stream") return isStream;
    if (tab.key === "response") return !isStream;
    if (tab.key === "payload") return !isStream;
    if (tab.key === "snippets") return !isStream;
    if (tab.key === "error") return !!request.error;
    if (tab.key === "proxy") return request.mode === "proxy";
    return true;
  });
}
