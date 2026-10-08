import type { Drift } from "@/features/contract/contract-report";
import { formatRelativeTime } from "@/lib/formatters";

function said(drift: Drift, calls: number): string {
  if (drift.kind === "undeclared") {
    return `not in the schema, which drops it · came as ${drift.observed.join(" or ")}`;
  }
  if (drift.kind === "type") {
    return `came as ${drift.observed.join(" or ")}; the schema takes ${(drift.declared ?? []).join(" or ")}`;
  }
  return `missing from ${drift.count} of ${calls} answers`;
}

/**
 * How an endpoint's answers differ from its response schema, a line each:
 * the field, what differs, when it was first and last seen, in how many
 * answers, and the hosts that sent them.
 *
 * @param props - The differences, how many answers were seen, and the time now
 * @returns The list
 * @example
 * ```tsx
 * <ContractDriftList drift={contract.drift} calls={contract.calls} now={now} />
 * ```
 */
export function ContractDriftList({
  drift,
  calls,
  now,
}: {
  drift: readonly Drift[];
  calls: number;
  now: number;
}): React.ReactNode {
  return (
    <ul
      aria-label="Differences from the schema"
      className="m-0 flex list-none flex-col overflow-hidden rounded-panel border border-warn/30 p-0"
    >
      {drift.map((difference) => (
        <li
          key={`${difference.kind}:${difference.path}`}
          className="flex flex-col gap-0.5 border-b border-line px-3 py-2 last:border-b-0"
        >
          <span className="truncate font-mono text-small text-fg">
            {difference.path || "(the answer)"}
          </span>
          <span className="text-small text-warn">{said(difference, calls)}</span>
          {difference.kind !== "missing" && (
            <span className="text-badge text-fg-subtle">
              first seen {formatRelativeTime(difference.firstSeen, now)} · last{" "}
              {formatRelativeTime(difference.lastSeen, now)} · in {difference.count} of {calls}{" "}
              answers
              {difference.places.length > 0 && ` · from ${difference.places.join(", ")}`}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
