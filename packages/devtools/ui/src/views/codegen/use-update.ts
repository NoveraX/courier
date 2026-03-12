import { useCallback, useEffect, useState } from "react"

import type { SpecDiff, UpdateContext, UpdateFileResult, UpdateResult } from "./types"
import { fetchUpdateApply, fetchUpdatePreview } from "./api-update";

export type UpdateStep = "summary" | "preview" | "applied"

interface UseUpdateReturn {
  ctx: UpdateContext
  step: UpdateStep
  setStep: (s: UpdateStep) => void
  preview: UpdateResult | null
  /** API-level diff (null when no cached digest) */
  specDiff: SpecDiff | null
  loading: boolean
  error: string | null
  activeFileIdx: number
  setActiveFileIdx: (i: number) => void
  loadPreview: () => Promise<void>
  applyAll: () => Promise<void>
  applySelected: (files: UpdateFileResult[]) => Promise<void>
  writtenCount: number
  deletedCount: number
}

export function useUpdate(ctx: UpdateContext): UseUpdateReturn {
  const [step, setStep] = useState<UpdateStep>("summary")
  const [preview, setPreview] = useState<UpdateResult | null>(null)
  const [specDiff, setSpecDiff] = useState<SpecDiff | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeFileIdx, setActiveFileIdx] = useState(0)
  const [writtenCount, setWrittenCount] = useState(0)
  const [deletedCount, setDeletedCount] = useState(0)

  const loadPreview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchUpdatePreview(ctx.sourceName, ctx.newSpec)
      setPreview(result)
      setSpecDiff(result.specDiff ?? null)
      /* Show summary if specDiff available, otherwise skip to preview */
      setStep(result.specDiff ? "summary" : "preview")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preview")
    } finally {
      setLoading(false)
    }
  }, [ctx.sourceName, ctx.newSpec])

  /* Auto-load preview on mount and when context changes */
  useEffect(() => { void loadPreview() }, [loadPreview])

  const applyFiles = useCallback(async (files: UpdateFileResult[]) => {
    setLoading(true)
    setError(null)
    try {
      const mapped = files.map((f) => ({ path: f.path, content: f.content }))
      const result = await fetchUpdateApply(ctx.sourceName, ctx.newSpec, mapped)
      setWrittenCount(result.written)
      setDeletedCount(result.deleted ?? 0)
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
    specDiff,
    loading,
    error,
    activeFileIdx,
    setActiveFileIdx,
    loadPreview,
    applyAll,
    applySelected,
    writtenCount,
    deletedCount,
  }
}
