import { WifiOff } from "lucide-react"

import { usePlayground } from "./use-playground"
import { PlaygroundToolbar } from "./toolbar"
import { RequestPanel } from "./request-panel"
import { ResponsePanel } from "./response-panel"
import { HistoryBar } from "./history-bar"

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-1">
        <WifiOff size={24} className="text-text-muted" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium text-text-primary">No app connected</h3>
        <p className="max-w-xs text-xs leading-relaxed text-text-muted">
          Start your application with Nexus DevTools enabled to use the API Playground.
          The playground will appear automatically once a session connects.
        </p>
      </div>
      <code className="rounded bg-surface-1 px-3 py-1.5 text-[11px] text-text-secondary">
        connectDevTools(sources)
      </code>
    </div>
  )
}

export function PlaygroundView() {
  const pg = usePlayground()

  if (!pg.hasSessions) {
    return <EmptyState />
  }

  return (
    <div className="flex h-full flex-col">
      <PlaygroundToolbar
        connected={pg.connected}
        isUsingDemo={pg.isUsingDemo}
        sourceNames={pg.sourceNames}
        selectedSource={pg.selectedSource}
        selectedGroup={pg.selectedGroup}
        selectedMethod={pg.selectedMethod}
        groups={pg.groups}
        methods={pg.methods}
        endpointInfo={pg.endpointInfo}
        mode={pg.mode}
        setMode={pg.setMode}
        loading={pg.loading}
        canSend={pg.canSend}
        onSourceChange={pg.handleSourceChange}
        onGroupChange={pg.handleGroupChange}
        onMethodChange={pg.setSelectedMethod}
        onSend={pg.handleSend}
      />

      <div className="flex flex-1 overflow-hidden">
        <RequestPanel
          variables={pg.variables}
          setVariables={pg.setVariables}
          headers={pg.headers}
          setHeaders={pg.setHeaders}
          variablesValid={pg.variablesValid}
          headersValid={pg.headersValid}
          endpointInfo={pg.endpointInfo}
          selectedSource={pg.selectedSource}
          selectedGroup={pg.selectedGroup}
          selectedMethod={pg.selectedMethod}
        />

        <ResponsePanel
          response={pg.response}
          responseTab={pg.responseTab}
          setResponseTab={pg.setResponseTab}
        />
      </div>

      <HistoryBar
        history={pg.playgroundHistory}
        activeId={pg.response?.id}
        onLoad={pg.loadFromHistory}
        onClear={pg.clearPlaygroundHistory}
      />
    </div>
  )
}
