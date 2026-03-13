import { useState } from "react"

import type { RequestEntry } from "../../../store"

import { Section, TabSwitcher } from "../../../components/ui"
import { JsonTree } from "../../../components/json-tree"

// ── Payload Tab ──────────────────────────────────────────────────────────────
// Shows variables in 3 views: Original, Validated, As Sent

type PayloadView = "original" | "validated" | "sent"

export function PayloadTab({ request }: { request: RequestEntry }) {
  const hasValidated = request.validatedVariables !== undefined
  const hasSent = request.sentBody !== undefined

  const availableTabs: { id: PayloadView; label: string }[] = [
    { id: "original", label: "Original" },
    ...(hasValidated ? [{ id: "validated" as const, label: "Validated" }] : []),
    ...(hasSent ? [{ id: "sent" as const, label: "As Sent" }] : []),
  ]

  const [view, setView] = useState<PayloadView>("original")

  const currentData =
    view === "validated"
      ? request.validatedVariables
      : view === "sent"
        ? request.sentBody
        : request.variables

  return (
    <Section
      title="Variables"
      actions={
        availableTabs.length > 1 ? (
          <TabSwitcher tabs={availableTabs} active={view} onChange={setView} />
        ) : undefined
      }
    >
      {currentData !== undefined ? (
        <JsonTree data={currentData} defaultExpanded={3} />
      ) : (
        <p className="text-[11px] italic text-muted-foreground">No variables</p>
      )}

      {/* Schema info */}
      {request.hasValidation.variables && (
        <div className="mt-2 rounded border border-border bg-muted px-2 py-1.5 text-[10px] text-muted-foreground">
          Variables validated against schema
          {hasValidated && view === "original" && " — switch to Validated to see result"}
        </div>
      )}
    </Section>
  )
}
