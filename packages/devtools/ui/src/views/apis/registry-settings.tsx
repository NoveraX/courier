import { useEffect, useMemo, useState } from "react"
import { X } from "lucide-react"

import type { GenerateOptions, SourceSummary } from "./types"
import { fetchParseSpec, fetchGenerateCode, fetchWriteFiles } from "./api"
import { formatWriteResult } from "./helpers"
import { RegistryEndpointEditor } from "./registry-endpoint-editor"
import { OptionsGrid, SelectedEndpoints, SettingsActions, TogglesRow } from "./registry-settings-parts"

export function RegistrySettings({ source, onClose, onRegenerated }: {
  source: SourceSummary
  onClose: () => void
  onRegenerated: () => void
}) {
  const [opts, setOpts] = useState<GenerateOptions>({ ...source.options })

  /* Sync opts when source updates (e.g. after endpoint editor applies changes) */
  useEffect(() => { setOpts({ ...source.options }) }, [source.options])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showEditor, setShowEditor] = useState(false)

  const isDirty = useMemo(
    () => JSON.stringify(opts) !== JSON.stringify(source.options),
    [opts, source.options],
  )

  const handleApply = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      if (!source.specUrl) {
        setError("Cannot re-generate: spec was imported from file/paste. Use \"Check for Updates\" to provide the new spec.")
        return
      }
      const spec = await fetchParseSpec(source.specUrl)
      const files = await fetchGenerateCode(spec, opts)
      const writeResult = await fetchWriteFiles(files, {
        sourceName: source.name,
        spec,
        specUrl: source.specUrl,
        importType: source.importType,
        options: opts,
      })
      setResult(formatWriteResult(writeResult))
      onRegenerated()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-border-default pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">Settings</span>
        <button type="button" onClick={onClose} className="rounded p-0.5 text-text-muted hover:text-text-secondary">
          <X size={12} />
        </button>
      </div>

      <OptionsGrid opts={opts} onChange={setOpts} />
      <TogglesRow opts={opts} onChange={setOpts} />
      <SelectedEndpoints opts={opts} />

      {error && <p className="text-xs text-red-400">{error}</p>}
      {result && <p className="text-xs text-emerald-400">{result}</p>}

      <SettingsActions
        loading={loading}
        isDirty={isDirty}
        isRaw={false}
        onApply={handleApply}
        onEditEndpoints={() => setShowEditor(true)}
      />

      {showEditor && (
        <RegistryEndpointEditor
          source={source}
          onClose={() => setShowEditor(false)}
          onApplied={onRegenerated}
        />
      )}
    </div>
  )
}
