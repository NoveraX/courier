export type AuditSeverity = "error" | "warning" | "hint" | "pass"

export interface AuditItem {
  id: string
  severity: AuditSeverity
  title: string
  description: string
  suggestion?: string
  endpoint?: string
  category: string
}
