import { useState } from "react"

import { DisconnectedBanner } from "../../components/ui"
import { useDevToolsStore } from "../../store"

import type { CodegenTab } from "./types"
import { useCodegen } from "./use-codegen"
import { CodegenHeader, SourceTabs } from "./codegen-header"
import { ErrorBanner, WatchDiffBanner } from "./codegen-banners"
import { ImportStep } from "./import-step"
import { SelectStep } from "./select-step"
import { OptionsStep } from "./options-step"
import { PreviewStep } from "./preview-step"
import { RegistryView } from "./registry-view"

export function CodegenView() {
  const { connectionStatus } = useDevToolsStore()
  const cg = useCodegen()
  const [tab, setTab] = useState<CodegenTab>("wizard")

  const switchToImport = () => {
    setTab("wizard")
    cg.setStep("import")
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {connectionStatus === "disconnected" && <DisconnectedBanner />}

      <CodegenHeader
        st={cg.st}
        src={cg.src}
        watching={cg.watching}
        sources={cg.sources}
        states={cg.states}
        onToggleWatch={cg.toggleWatch}
        onSaveConfig={cg.handleSaveConfig}
        step={cg.step}
        onStepChange={cg.setStep}
        tab={tab}
        onTabChange={setTab}
      />

      {tab === "wizard" && (
        <SourceTabs
          sources={cg.sources}
          states={cg.states}
          activeSourceIdx={cg.activeSourceIdx}
          onSwitch={cg.switchSource}
          onRemove={cg.removeSource}
          onAdd={cg.addSource}
        />
      )}

      {tab === "wizard" && cg.error && <ErrorBanner error={cg.error} onDismiss={() => cg.setError(null)} />}

      {tab === "wizard" && cg.watchDiff && (
        <WatchDiffBanner
          watchDiff={cg.watchDiff}
          st={cg.st}
          onReview={() => { cg.setWatchDiff(null); cg.setStep("select") }}
          onDismiss={() => cg.setWatchDiff(null)}
        />
      )}

      <div className="flex-1 overflow-auto p-4">
        {tab === "registry" && <RegistryView onImportNew={switchToImport} />}
        {tab === "wizard" && cg.step === "import" && (
          <ImportStep source={cg.src.importSource} content={cg.src.importContent} loading={cg.loading} onSourceChange={(v) => cg.updateSource({ importSource: v })} onContentChange={(v) => cg.updateSource({ importContent: v })} onParse={cg.handleParse} />
        )}
        {tab === "wizard" && cg.step === "select" && cg.st.spec && (
          <SelectStep spec={cg.st.spec} selection={cg.st.selection} totalSelected={cg.totalSelected} totalEndpoints={cg.totalEndpoints} options={cg.src.options} groupKeys={cg.groupKeys} onToggleGroup={cg.toggleGroup} onToggleEndpoint={cg.toggleEndpoint} onSelectAll={cg.selectAll} onDeselectAll={cg.deselectAll} onOptionsChange={(o) => cg.updateSource({ name: o.sourceName, options: o })} onNext={() => cg.setStep("options")} />
        )}
        {tab === "wizard" && cg.step === "options" && cg.st.spec && (
          <OptionsStep options={cg.src.options} loading={cg.loading} onOptionsChange={(o) => cg.updateSource({ options: o })} onGenerate={cg.handleGenerate} />
        )}
        {tab === "wizard" && cg.step === "preview" && cg.st.files.length > 0 && (
          <PreviewStep files={cg.st.files} activeFileIndex={cg.st.activeFileIndex} loading={cg.loading} writeResult={cg.writeResult} onFileSelect={(i) => cg.updateState({ activeFileIndex: i })} onWrite={cg.handleWrite} onCopy={cg.handleCopyAll} onDownload={cg.handleDownload} />
        )}
      </div>
    </div>
  )
}
