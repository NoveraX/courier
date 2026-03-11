import type { EndpointInfo } from "../../store"

import { Badge } from "../../components/ui"

export function RequestPanel({
  variables,
  setVariables,
  headers,
  setHeaders,
  variablesValid,
  headersValid,
  endpointInfo,
  selectedSource,
  selectedGroup,
  selectedMethod,
}: {
  variables: string
  setVariables: (v: string) => void
  headers: string
  setHeaders: (v: string) => void
  variablesValid: boolean
  headersValid: boolean
  endpointInfo: EndpointInfo | null
  selectedSource: string
  selectedGroup: string
  selectedMethod: string
}) {
  return (
    <div className="flex w-1/2 flex-col border-r border-border-default">
      <div className="flex-1 overflow-y-auto p-4">
        {/* Variables editor */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Variables
            </label>
            {endpointInfo?.hasVariablesSchema && (
              <span className="text-[10px] text-emerald-400">Schema defined</span>
            )}
          </div>
          <textarea
            value={variables}
            onChange={(e) => setVariables(e.target.value)}
            className="h-32 w-full resize-y rounded-lg border border-border-default bg-surface-1 p-3 font-mono text-[11px] text-text-primary outline-none focus:border-indigo-500/50"
            placeholder='{ "id": 1 }'
            spellCheck={false}
          />
          {!variablesValid && variables !== "{}" && (
            <p className="mt-1 text-[10px] text-red-400">Invalid JSON</p>
          )}
        </div>

        {/* Headers editor */}
        <div className="mb-4">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Headers
          </label>
          <textarea
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
            className="h-20 w-full resize-y rounded-lg border border-border-default bg-surface-1 p-3 font-mono text-[11px] text-text-primary outline-none focus:border-indigo-500/50"
            placeholder='{ "Authorization": "Bearer ..." }'
            spellCheck={false}
          />
          {!headersValid && headers !== "{}" && (
            <p className="mt-1 text-[10px] text-red-400">
              Invalid headers — must be a flat {"{"} key: string {"}"} object
            </p>
          )}
        </div>

        {/* Endpoint info */}
        {endpointInfo && (
          <EndpointInfoPanel
            endpointInfo={endpointInfo}
            selectedSource={selectedSource}
            selectedGroup={selectedGroup}
            selectedMethod={selectedMethod}
          />
        )}
      </div>
    </div>
  )
}

function EndpointInfoPanel({
  endpointInfo,
  selectedSource,
  selectedGroup,
  selectedMethod,
}: {
  endpointInfo: EndpointInfo
  selectedSource: string
  selectedGroup: string
  selectedMethod: string
}) {
  return (
    <div className="rounded-lg border border-border-default bg-surface-1 p-3">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Endpoint Info
      </h4>
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span className="text-text-muted">Path</span>
          <span className="font-mono text-text-secondary">
            {selectedSource}.{selectedGroup}.{selectedMethod}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Type</span>
          <Badge variant={endpointInfo.type === "query" ? "emerald" : "amber"}>
            {endpointInfo.type}
          </Badge>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Variables Schema</span>
          <span className={endpointInfo.hasVariablesSchema ? "text-emerald-400" : "text-text-muted"}>
            {endpointInfo.hasVariablesSchema ? "Yes" : "No"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Response Schema</span>
          <span className={endpointInfo.hasResponseSchema ? "text-emerald-400" : "text-text-muted"}>
            {endpointInfo.hasResponseSchema ? "Yes" : "No"}
          </span>
        </div>
        {(endpointInfo.middleware?.length ?? 0) > 0 && (
          <div className="flex justify-between">
            <span className="text-text-muted">Middleware</span>
            <div className="flex gap-1">
              {endpointInfo.middleware.map((m) => (
                <Badge key={m} variant="violet">{m}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
