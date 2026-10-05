/** How an audit rule ended. */
export type Severity = "error" | "warning" | "pass"

/** A rule the audit shows: what it says while failing, and once it passes. */
export interface AuditRule {
  failing: { title: string; detail: string }
  passing: { title: string; detail: string }
}

/**
 * Four of Studio's audit rules, each as it reads while failing and once
 * fixed.
 *
 * @example
 * ```ts
 * AUDIT_RULES[2].failing.title // "N+1 request pattern"
 * ```
 */
export const AUDIT_RULES: readonly AuditRule[] = [
  {
    failing: { title: "High error rate", detail: "billing.invoices.list fails on 28% of calls" },
    passing: {
      title: "Error rate under 1%",
      detail: "billing.invoices.list recovered after the fix",
    },
  },
  {
    failing: {
      title: "Retry on non-idempotent mutation",
      detail: "retry wraps POST without an idempotency key",
    },
    passing: {
      title: "Retries are idempotent",
      detail: "POST retries now send an idempotency key",
    },
  },
  {
    failing: { title: "N+1 request pattern", detail: "users.get called 8× after users.list" },
    passing: {
      title: "Requests are batched",
      detail: "users.get folded into a single users.list call",
    },
  },
  {
    failing: {
      title: "Mutations without authentication",
      detail: "orders.void is sent without a bearer token",
    },
    passing: {
      title: "Mutations are authenticated",
      detail: "All 9 mutations send a bearer token",
    },
  },
]

/** The sessions the audit cycles through, as each rule's severity. */
const SESSIONS: readonly (readonly Severity[])[] = [
  ["error", "error", "warning", "pass"],
  ["error", "pass", "warning", "pass"],
  ["error", "pass", "pass", "pass"],
  ["pass", "pass", "pass", "pass"],
  ["error", "error", "warning", "error"],
]

/** How many ticks one session shows for: a tick to start, one per rule, then a rest. */
export const SESSION_TICKS = 18

/* The clock starts in the first session's rest, its rules already checked. */
const START = 5

/** The audit at one tick: each rule's severity, and the rule just re-checked. */
export interface AuditFrame {
  severities: Severity[]
  /** The rule being re-checked, or -1 between checks. */
  checking: number
}

/**
 * The audit at a tick: every session re-checks its rules one by one,
 * each switching to its new severity as it is checked.
 *
 * @param tick - The visual's clock
 * @returns The frame
 * @example
 * ```ts
 * auditFrame(0).severities // ["error", "error", "warning", "pass"]
 * ```
 */
export function auditFrame(tick: number): AuditFrame {
  const session = Math.floor((tick + START) / SESSION_TICKS)
  const phase = (tick + START) % SESSION_TICKS
  const now = SESSIONS[session % SESSIONS.length] ?? []
  const before = SESSIONS[(session + SESSIONS.length - 1) % SESSIONS.length] ?? []
  return {
    severities: [0, 1, 2, 3].map(
      (rule) => (phase >= 1 + rule ? now[rule] : before[rule]) ?? "pass"
    ),
    checking: phase >= 1 && phase <= 4 ? phase - 1 : -1,
  }
}

/**
 * A session's score: a hundred, less five for each error and two for each
 * warning.
 *
 * @param severities - The rules' severities
 * @returns The score
 * @example
 * ```ts
 * auditScore(["error", "warning", "pass", "pass"]) // 93
 * ```
 */
export function auditScore(severities: readonly Severity[]): number {
  return 100 - severities.reduce((sum, s) => sum + (s === "error" ? 5 : s === "warning" ? 2 : 0), 0)
}

/**
 * What a score is called, and how its ring is coloured.
 *
 * @param score - The score
 * @returns Its label and tone
 * @example
 * ```ts
 * scoreLook(88) // { label: "Good", tone: "warn" }
 * ```
 */
export function scoreLook(score: number): { label: string; tone: "ok" | "warn" | "err" } {
  if (score >= 95) return { label: "Excellent", tone: "ok" }
  return score >= 85 ? { label: "Good", tone: "warn" } : { label: "Needs work", tone: "err" }
}
