import { createFileRoute } from "@tanstack/react-router";
import { useApisContext } from "../../views/apis/apis-context";
import { ImportStep } from "../../views/apis/import-step";
import { SelectStep } from "../../views/apis/select-step";
import { OptionsStep } from "../../views/apis/options-step";
import { PreviewStep } from "../../views/apis/preview-step";

function ApisImportRoute() {
  const cg = useApisContext();

  if (cg.step === "select" && cg.st.spec) {
    return (
      <SelectStep
        spec={cg.st.spec}
        selection={cg.st.selection}
        totalSelected={cg.totalSelected}
        totalEndpoints={cg.totalEndpoints}
        options={cg.src.options}
        groupKeys={cg.groupKeys}
        onToggleGroup={cg.toggleGroup}
        onToggleEndpoint={cg.toggleEndpoint}
        onSelectAll={cg.selectAll}
        onDeselectAll={cg.deselectAll}
        onOptionsChange={(o) => cg.updateSource({ name: o.sourceName, options: o })}
        onNext={() => cg.setStep("options")}
      />
    );
  }

  if (cg.step === "options" && cg.st.spec) {
    return (
      <OptionsStep
        options={cg.src.options}
        loading={cg.loading}
        onOptionsChange={(o) => cg.updateSource({ options: o })}
        onGenerate={cg.handleGenerate}
      />
    );
  }

  if (cg.step === "preview" && cg.st.files.length > 0) {
    return (
      <PreviewStep
        files={cg.st.files}
        activeFileIndex={cg.st.activeFileIndex}
        loading={cg.loading}
        writeResult={cg.writeResult}
        onFileSelect={(i) => cg.updateState({ activeFileIndex: i })}
        onWrite={cg.handleWrite}
        onCopy={cg.handleCopyAll}
        onDownload={cg.handleDownload}
      />
    );
  }

  return (
    <ImportStep
      source={cg.src.importSource}
      content={cg.src.importContent}
      loading={cg.loading}
      onSourceChange={(v) => cg.updateSource({ importSource: v })}
      onContentChange={(v) => cg.updateSource({ importContent: v })}
      onParse={cg.handleParse}
    />
  );
}

export const Route = createFileRoute("/apis/import")({
  component: ApisImportRoute,
});
