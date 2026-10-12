import type { StudioAuditInputs } from "../mcp/audit-tool";
import type { RequestLog } from "../request-log";
import { type EditorFinding, editorFindings } from "./editor-findings";

/* While requests keep coming, the audit runs at most this often. */
const FRESH_MS = 2000;

/** What the editor's findings are worked out from. */
export interface FindingsInputs extends Omit<StudioAuditInputs, "requestLog"> {
  readonly requestLog: Pick<RequestLog, "events" | "version">;
}

/** Studio's audit as the editor reads it. */
export interface FindingsCache {
  /** The findings: the ones kept while nothing they come from changed, worked out again otherwise. */
  read(): EditorFinding[];
}

interface Kept {
  version: number;
  declared: unknown;
  runtimes: string;
  at: number;
  findings: EditorFinding[];
}

/**
 * Keep the findings of Studio's audit that an editor places at its calls.
 * The audit folds every request the log keeps, as a page does, and goes
 * through all of them; an editor asks again every few seconds. It runs
 * again only once the log, the sources the config declares or the
 * runtimes attached have changed — and while requests keep coming, at
 * most every two seconds.
 *
 * @param inputs - The requests, the sources and the runtimes
 * @param now - The clock
 * @returns The cache
 * @example
 * ```ts
 * const findings = findingsCache({ requestLog, ...auditInputsOf(project, root) });
 * res.json({ findings: findings.read() });
 * ```
 */
export function findingsCache(inputs: FindingsInputs, now: () => number = Date.now): FindingsCache {
  let kept: Kept | undefined;
  return {
    read() {
      const version = inputs.requestLog.version();
      const declared = inputs.declared();
      const runtimes = JSON.stringify(inputs.runtimes());
      const same =
        kept !== undefined &&
        kept.version === version &&
        kept.declared === declared &&
        kept.runtimes === runtimes;
      if (kept !== undefined && (same || now() - kept.at < FRESH_MS)) return kept.findings;
      const findings = editorFindings(inputs);
      kept = { version, declared, runtimes, at: now(), findings };
      return findings;
    },
  };
}
