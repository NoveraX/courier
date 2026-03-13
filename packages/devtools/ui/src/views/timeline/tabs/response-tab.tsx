import { useState } from "react"

import type { RequestEntry } from "../../../store"

import { Section, TabSwitcher, formatSize } from "../../../components/ui"
import { JsonTree } from "../../../components/json-tree"

// ── Response Tab ─────────────────────────────────────────────────────────────
// Shows response in 3 views: Formatted (JSON tree), Raw (text), Validated

type ResponseView = "formatted" | "raw" | "validated"

export function ResponseTab({ request }: { request: RequestEntry }) {
  const hasRaw = request.rawResponse !== undefined
  const hasValidated = request.validatedResponse !== undefined

  const availableTabs: { id: ResponseView; label: string }[] = [
    { id: "formatted", label: "Formatted" },
    ...(hasRaw ? [{ id: "raw" as const, label: "Raw" }] : []),
    ...(hasValidated ? [{ id: "validated" as const, label: "Validated" }] : []),
  ]

  const [view, setView] = useState<ResponseView>("formatted")

  return (
    <Section
      title="Response Data"
      actions={
        availableTabs.length > 1 ? (
          <TabSwitcher tabs={availableTabs} active={view} onChange={setView} />
        ) : undefined
      }
    >
      {/* Formatted view — JSON tree */}
      {view === "formatted" && (
        request.data !== undefined ? (
          <JsonTree data={request.data} defaultExpanded={3} />
        ) : (
          <p className="text-[11px] italic text-muted-foreground">No response data</p>
        )
      )}

      {/* Raw view — plain text */}
      {view === "raw" && (
        <pre className="max-h-80 overflow-auto rounded bg-muted p-2 text-[11px] text-muted-foreground">
          {request.rawResponse ?? "No raw response captured"}
        </pre>
      )}

      {/* Validated view — JSON tree of post-validation data */}
      {view === "validated" && (
        request.validatedResponse !== undefined ? (
          <JsonTree data={request.validatedResponse} defaultExpanded={3} />
        ) : (
          <p className="text-[11px] italic text-muted-foreground">No validated response</p>
        )
      )}

      {/* Size info */}
      {request.size != null && request.size > 0 && (
        <div className="mt-2 text-[10px] text-muted-foreground">
          Response size: {formatSize(request.size)}
        </div>
      )}

      {/* Schema info */}
      {request.hasValidation.response && (
        <div className="mt-1 rounded border border-border bg-muted px-2 py-1.5 text-[10px] text-muted-foreground">
          Response validated against schema
          {hasValidated && view === "formatted" && " — switch to Validated to see result"}
        </div>
      )}
    </Section>
  )
}
