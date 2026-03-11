import { useCallback, useState } from "react"

import type { UpdateContext, UpdateFileResult, UpdateResult } from "./types"
import { fetchUpdateApply, fetchUpdatePreview } from "./api"

type UpdateStep = "summary" | "preview" | "applied"

interface UseUpdateReturn {
  ctx: UpdateContext
  step: UpdateStep
  setStep: (s: UpdateStep) => void
  preview: UpdateResult | null
  loading: boolean
  error: string | null
  /** Selected file index in diff preview */
  activeFileIdx: number
  setActiveFileIdx: (i: number) => void
  /** Fetch merge preview from server */
  loadPreview: () => Promise<void>
  /** Apply all merged files to disk */
  applyAll: () => Promise<void>
  /** Apply only selected files */
  applySelected: (files: UpdateFileResult[]) => Promise<void>
  /** Number of files written after apply */
  writtenCount: number
}

export function useUpdate(ctx: UpdateContext): UseUpdateReturn {
  const [step, setStep] = useState<UpdateStep>("summary")
  const [preview, setPreview] = useState<UpdateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeFileIdx, setActiveFileIdx] = useState(0)
  const [writtenCount, setWrittenCount] = useState(0)

  const loadPreview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchUpdatePreview(ctx.sourceName, ctx.newSpec)
      setPreview(result)
      setStep("preview")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preview")
    } finally {
      setLoading(false)
    }
  }, [ctx.sourceName, ctx.newSpec])

  const applyFiles = useCallback(async (files: UpdateFileResult[]) => {
    setLoading(true)
    setError(null)
    try {
      const mapped = files.map((f) => ({ path: f.path, content: f.content }))
      const result = await fetchUpdateApply(ctx.sourceName, ctx.newSpec, mapped)
      setWrittenCount(result.written)
      setStep("applied")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply update")
    } finally {
      setLoading(false)
    }
  }, [ctx.sourceName, ctx.newSpec])

  const applyAll = useCallback(async () => {
    if (!preview) return
    await applyFiles(preview.files)
  }, [preview, applyFiles])

  const applySelected = useCallback(async (files: UpdateFileResult[]) => {
    await applyFiles(files)
  }, [applyFiles])

  return {
    ctx,
    step,
    setStep,
    preview,
    loading,
    error,
    activeFileIdx,
    setActiveFileIdx,
    loadPreview,
    applyAll,
    applySelected,
    writtenCount,
  }
}
