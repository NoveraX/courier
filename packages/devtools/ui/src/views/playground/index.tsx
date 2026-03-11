import { usePlayground } from "./use-playground"
import { PlaygroundToolbar } from "./toolbar"
import { RequestPanel } from "./request-panel"
import { ResponsePanel } from "./response-panel"
import { HistoryBar } from "./history-bar"

export function PlaygroundView() {
  const pg = usePlayground()

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
