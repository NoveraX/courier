import type { EndpointCall, Finding } from "../studio/studio-types";

/** A finding placed at a call it concerns, as the editor marks it. */
export interface PlacedFinding {
  /** The call's place, lines and columns from 1 */
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  /** An audit error is a warning in the editor: the code compiles, its traffic needs a look */
  readonly severity: "warning" | "information" | "hint";
  readonly message: string;
  /** The finding's id, which names its rule — the first's, for a call several of one kind concern */
  readonly finding: string;
}

const SEVERITY = { error: "warning", warning: "information", hint: "hint" } as const;
const RANK = { error: 0, warning: 1, hint: 2 } as const;

interface Concerning {
  readonly finding: Finding;
  readonly seen: string;
  count: number;
}

/**
 * Studio's audit findings placed at the calls they concern in one file:
 * each finding at every call to an endpoint it names, with what the audit
 * saw at that endpoint — so an N+1 pattern is marked where the code asks
 * for each item, and a write without credentials where it writes. Findings
 * of one kind at one call — the same call repeated with fifteen sets of
 * variables — make one mark, at the gravest of them.
 *
 * @param calls - The file's calls, as Studio placed them
 * @param findings - The audit's findings that concern endpoints, gravest first
 * @returns The placed findings, in the order of the calls
 * @example
 * ```ts
 * findingsAtCalls(calls, findings)[0]?.message; // "Timeout risk — P95 = 6.4s. Add a timeout option…"
 * ```
 */
export function findingsAtCalls(
  calls: readonly EndpointCall[],
  findings: readonly Finding[],
): PlacedFinding[] {
  return calls.flatMap((call) =>
    [...concerningCall(call, findings).values()].map(({ finding, seen, count }) => {
      const more = count > 1 ? `, and ${count - 1} more like it` : "";
      const advice = finding.suggestion ? ` ${finding.suggestion}` : "";
      return {
        line: call.line,
        column: call.column,
        endLine: call.endLine,
        endColumn: call.endColumn,
        severity: SEVERITY[finding.severity],
        message: `${finding.title} — ${seen}${more}.${advice}`,
        finding: finding.id,
      };
    }),
  );
}

/* The findings that name an endpoint the call may reach, one per kind: the gravest, and how many there are. */
function concerningCall(call: EndpointCall, findings: readonly Finding[]): Map<string, Concerning> {
  const kinds = new Map<string, Concerning>();
  for (const finding of findings) {
    const concerned = finding.endpoints.find((named) =>
      call.endpoints.some((own) => own.source === named.source && own.endpoint === named.endpoint),
    );
    if (!concerned) continue;
    const known = kinds.get(finding.title);
    if (known) {
      known.count += 1;
      if (RANK[finding.severity] >= RANK[known.finding.severity]) continue;
    }
    const seen = (concerned.detail ?? finding.description).replace(/[.\s]+$/, "");
    kinds.set(finding.title, { finding, seen, count: known ? known.count : 1 });
  }
  return kinds;
}
