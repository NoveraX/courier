import { AlertTriangle, Lightbulb } from "lucide-react"

import type { RequestEntry } from "../../../store"

import { Section, Row, Badge } from "../../../components/ui"
import { getErrorSuggestions } from "../request-helpers"

// ── Error Tab ────────────────────────────────────────────────────────────────
// Error details, validation issues breakdown, suggestions

export function ErrorTab({ request }: { request: RequestEntry }) {
  if (!request.error) {
    return <p className="text-[11px] italic text-text-muted">No error</p>
  }

  const { error } = request
  const suggestions = getErrorSuggestions(error)

  return (
    <div className="space-y-4">
      {/* Error details */}
      <Section title="Error Details">
        <Row label="Type" value={error.type} />
        {error.status != null && <Row label="Status" value={String(error.status)} />}
        <div className="mt-2">
          <h4 className="mb-1 text-[10px] font-medium text-text-muted">Message</h4>
          <pre className="whitespace-pre-wrap rounded border border-red-500/10 bg-red-500/5 p-2 text-[11px] text-red-400">
            {error.message}
          </pre>
        </div>
      </Section>

      {/* Validation issues breakdown */}
      {error.validationIssues && error.validationIssues.length > 0 && (
        <Section title="Validation Issues">
          <div className="space-y-2">
            {error.validationIssues.map((issue, i) => (
              <div
                key={i}
                className="rounded border border-orange-500/10 bg-orange-500/5 p-2"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0 text-orange-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="text-[10px] font-medium text-orange-400">
                        {issue.path || "(root)"}
                      </code>
                    </div>
                    <p className="mt-0.5 text-[11px] text-text-secondary">{issue.message}</p>
                    {(issue.expected || issue.received) && (
                      <div className="mt-1 flex gap-3 text-[10px]">
                        {issue.expected && (
                          <span className="text-text-muted">
                            Expected: <Badge variant="emerald">{issue.expected}</Badge>
                          </span>
                        )}
                        {issue.received && (
                          <span className="text-text-muted">
                            Received: <Badge variant="red">{issue.received}</Badge>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <Section title="Suggestions">
          <div className="space-y-1.5">
            {suggestions.map((suggestion, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <Lightbulb
                  size={12}
                  className="mt-0.5 shrink-0 text-amber-400"
                />
                <span className="text-text-secondary">{suggestion}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
