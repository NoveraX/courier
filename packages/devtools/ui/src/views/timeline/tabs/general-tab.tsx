import type { RequestEntry } from "../../../store"

import { Section, Row, formatSize } from "../../../components/ui"
import { STATUS_CONFIG } from "../constants"

// ── General Tab ──────────────────────────────────────────────────────────────

export function GeneralTab({ request }: { request: RequestEntry }) {
  return (
    <>
      <Section title="Request">
        <Row label="Source" value={request.source} />
        {request.group && <Row label="Group" value={request.group} />}
        <Row label="Method" value={request.method} />
        {request.httpMethod && <Row label="HTTP Method" value={request.httpMethod} />}
        {request.url && <Row label="URL" value={request.url} mono />}
        <Row label="Mode" value={request.mode} />
        {request.type && <Row label="Type" value={request.type} />}
        <Row label="Status" value={STATUS_CONFIG[request.status].label} />
        {request.statusCode != null && (
          <Row label="Status Code" value={String(request.statusCode)} />
        )}
      </Section>

      <Section title="Meta">
        {request.middlewareCount > 0 && (
          <Row label="Middleware" value={String(request.middlewareCount)} />
        )}
        {request.hasValidation.variables && <Row label="Variables Schema" value="Yes" />}
        {request.hasValidation.response && <Row label="Response Schema" value="Yes" />}
        {request.size != null && <Row label="Response Size" value={formatSize(request.size)} />}
        <Row label="Started At" value={new Date(request.startedAt).toLocaleString()} />
        {request.timing && (
          <Row label="Duration" value={`${Math.round(request.timing.total)}ms`} />
        )}
      </Section>
    </>
  )
}
