import type { AgentMark, PageMark } from "@/features/apis/types";

import { isPlainObject } from "./is-plain-object";

const ACCESSES: ReadonlySet<unknown> = new Set(["read", "write", "destructive"]);

/**
 * Whether the marks an endpoint's analysis carries are as Studio's server
 * writes them — what the agents policy decided for it, and whether a page
 * may call it through the proxy — each absent or well formed, so the
 * Explorer and the Playground can read them as typed.
 *
 * @param analysis - An endpoint's analysis, as Socket.IO delivered it
 * @returns Whether its marks are well formed
 * @example
 * ```ts
 * areMarksWellFormed({ page: { exposed: true, reason: "marked .expose()" } }); // true
 * ```
 */
export function areMarksWellFormed(analysis: Record<string, unknown>): boolean {
  return (
    (analysis.agent === undefined || isAgentMark(analysis.agent)) &&
    (analysis.page === undefined || isPageMark(analysis.page))
  );
}

function isAgentMark(mark: unknown): mark is AgentMark {
  return (
    isPlainObject(mark) &&
    typeof mark.offered === "boolean" &&
    typeof mark.reason === "string" &&
    (mark.tool === undefined || typeof mark.tool === "string") &&
    (mark.access === undefined || ACCESSES.has(mark.access)) &&
    (mark.confirm === undefined || typeof mark.confirm === "boolean")
  );
}

function isPageMark(mark: unknown): mark is PageMark {
  return (
    isPlainObject(mark) && typeof mark.exposed === "boolean" && typeof mark.reason === "string"
  );
}
