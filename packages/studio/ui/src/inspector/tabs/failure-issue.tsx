import { Braces } from "lucide-react";

import { valueAtPath } from "@/features/requests/json-tree";
import type { ValidationIssue } from "@/store/types-events";

/**
 * A schema issue of a failed request: where in the payload it is, what the
 * schema said, and what arrived beside what was expected.
 *
 * @param props - The issue, and the payload it was found in
 * @returns The issue's card
 * @example
 * ```tsx
 * <FailureIssue issue={{ path: "id", message: "Expected number" }} payload={{ id: "one" }} />
 * ```
 */
export function FailureIssue({
  issue,
  payload,
}: {
  issue: ValidationIssue;
  payload: unknown;
}): React.ReactNode {
  const at = valueAtPath(payload, issue.path);
  const received = issue.received ?? (at.found ? JSON.stringify(at.value) : undefined);
  return (
    <div className="overflow-hidden rounded-panel border border-line">
      <div className="flex h-9 items-center gap-2 border-b border-line bg-panel-subtle px-3">
        <Braces aria-hidden="true" className="size-3 text-fg-subtle" />
        <span className="font-mono text-small text-syntax-function">{issue.path || "root"}</span>
        <span className="flex-1" />
        <span className="truncate text-label text-fg-subtle">{issue.message}</span>
      </div>
      <div className="font-mono text-small">
        {received !== undefined && (
          <div className="grid grid-cols-[14px_70px_minmax(0,1fr)] gap-2 bg-err-dim px-3 py-1.75">
            <span className="text-err">−</span>
            <span className="text-fg-subtle">received</span>
            <span className="text-err [overflow-wrap:anywhere]">{received}</span>
          </div>
        )}
        {issue.expected && (
          <div className="grid grid-cols-[14px_70px_minmax(0,1fr)] gap-2 bg-ok-dim px-3 py-1.75">
            <span className="text-ok">+</span>
            <span className="text-fg-subtle">expected</span>
            <span className="text-ok [overflow-wrap:anywhere]">{issue.expected}</span>
          </div>
        )}
      </div>
    </div>
  );
}
