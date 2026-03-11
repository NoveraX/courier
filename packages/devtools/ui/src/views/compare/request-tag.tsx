import type { RequestEntry } from "../../store"
import { STATUS_CONFIG, HTTP_METHOD_COLORS } from "../timeline/constants"

export function RequestTag({ request }: { request: RequestEntry }) {
  const label = [request.source, request.group, request.method].filter(Boolean).join(".")
  const statusCfg = STATUS_CONFIG[request.status]
  const methodColor = HTTP_METHOD_COLORS[request.httpMethod ?? "GET"] ?? "text-text-secondary"

  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-1.5 w-1.5 rounded-full ${statusCfg.dotClass}`} />
      <span className={`text-[10px] font-medium ${methodColor}`}>{request.httpMethod ?? "GET"}</span>
      <span className="font-mono text-[10px] text-text-secondary">{label}</span>
      {request.statusCode != null && (
        <span className="text-[10px] text-text-muted">{request.statusCode}</span>
      )}
    </div>
  )
}
