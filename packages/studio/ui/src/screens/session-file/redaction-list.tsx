import type { Redaction } from "@/features/sessions/session-file";

/**
 * The values a session file replaced because their names say they hold a
 * secret: each one's request, by its place and endpoint, and where in it
 * the value was.
 *
 * @param props - The values replaced
 * @returns The list, or a line saying there were none
 * @example
 * ```tsx
 * <RedactionList redactions={draft.redactions} />
 * ```
 */
export function RedactionList({
  redactions,
}: {
  redactions: readonly Redaction[];
}): React.ReactNode {
  if (redactions.length === 0) {
    return (
      <p className="m-0 text-small text-fg-muted">
        No body field or query parameter is named like a secret.
      </p>
    );
  }
  return (
    <ul
      aria-label="Values replaced"
      className="m-0 flex max-h-44 list-none flex-col overflow-auto rounded-panel border border-line p-0"
    >
      {redactions.map(({ at, endpoint, field }) => (
        <li
          key={`${at}:${field}`}
          className="flex min-h-8 items-center gap-2.5 border-b border-line px-3 last:border-b-0"
        >
          <span className="w-9 shrink-0 font-mono text-badge text-fg-subtle tabular-nums">
            #{at}
          </span>
          <span className="min-w-0 truncate font-mono text-small">{endpoint || "request"}</span>
          <span className="ml-auto min-w-0 truncate font-mono text-small text-fg-muted">
            {field}
          </span>
        </li>
      ))}
    </ul>
  );
}
