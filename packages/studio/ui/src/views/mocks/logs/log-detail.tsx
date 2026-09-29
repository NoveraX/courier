import { useState } from "react";

import { DetailPanel } from "@/components/shared/detail-panel";
import type { DetailTabKey } from "@/components/shared/detail-panel/constants";
import type { MockRequestLog } from "@/store/mock-slice";
import type { RequestEntry } from "@/store/types";

interface LogDetailProps {
  log: MockRequestLog;
  serverUrl: string;
  onClose: () => void;
}

export function LogDetail({ log, serverUrl, onClose }: LogDetailProps): React.ReactElement {
  const [tab, setTab] = useState<DetailTabKey>("general");
  const request = toRequestEntry(log, serverUrl);

  return (
    <div className="h-full w-105 shrink-0">
      <DetailPanel
        request={request}
        activeTab={tab}
        onTabChange={setTab}
        onClose={onClose}
        hideSourceMode
      />
    </div>
  );
}

function isNonEmpty(val: unknown): boolean {
  if (val == null) return false;
  if (typeof val === "object" && Object.keys(val as object).length === 0) return false;
  return true;
}

/** Adapt MockRequestLog to RequestEntry so the shared DetailPanel works as-is */
function toRequestEntry(log: MockRequestLog, serverUrl: string): RequestEntry {
  const fullUrl = `${serverUrl}${log.path}`;
  const hasError = !!log.error;
  const status: RequestEntry["status"] = hasError
    ? "error"
    : log.status == null
      ? "pending"
      : "success";

  return {
    id: log.id,
    source: "mock",
    group: log.group || undefined,
    method: log.endpoint,
    httpMethod: log.httpMethod,
    variables: isNonEmpty(log.variables) ? log.variables : undefined,
    mode: "direct",
    status,
    statusCode: log.status,
    url: fullUrl,
    timing:
      log.duration != null
        ? { total: log.duration, middleware: 0, fetch: log.duration, validation: 0 }
        : undefined,
    data: log.data,
    requestHeaders: log.requestHeaders,
    headers: log.responseHeaders,
    error: hasError ? { type: "http", message: log.error! } : undefined,
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: log.timestamp,
    sessionId: log.serverId,
  };
}
