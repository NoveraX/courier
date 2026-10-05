import { MAX_SCORE, SEVERITY_WEIGHT } from "./audit-meta";
import type { AuditCategory, AuditItem, AuditSeverity } from "./types";

/** How a score reads: good, worth a look, or bad. */
export type ScoreTone = "ok" | "warn" | "err";

/** What a score is called, and the colour it reads in. */
export interface Grade {
  label: "Excellent" | "Good" | "Needs attention" | "At risk";
  tone: ScoreTone;
}

/* The most findings of one severity take from a score, so one kind cannot zero it. */
const MAX_PENALTY: Readonly<Record<AuditSeverity, number>> = {
  error: 60,
  warning: 30,
  hint: 10,
  pass: Number.POSITIVE_INFINITY,
};

/**
 * The score of a set of findings: 100 less what each error, warning and
 * hint takes — 15, 5 and 2, each kind capped at 60, 30 and 10 — plus a
 * point for each check passed, between 0 and 100.
 *
 * @param items - The findings
 * @returns The score
 * @example
 * ```ts
 * auditScore([{ severity: "error" }, { severity: "pass" }]); // 86
 * ```
 */
export function auditScore(items: readonly Pick<AuditItem, "severity">[]): number {
  const taken: Record<AuditSeverity, number> = { error: 0, warning: 0, hint: 0, pass: 0 };
  for (const { severity } of items) {
    taken[severity] = Math.min(
      taken[severity] + Math.abs(SEVERITY_WEIGHT[severity]),
      MAX_PENALTY[severity],
    );
  }
  const score = MAX_SCORE - taken.error - taken.warning - taken.hint + taken.pass;
  return Math.max(0, Math.min(MAX_SCORE, score));
}

/**
 * Each category's score: the same reckoning over its own findings, so a
 * category with nothing found reads 100.
 *
 * @param items - The findings
 * @returns The score of each category
 * @example
 * ```ts
 * categoryScores(items).security; // 95
 * ```
 */
export function categoryScores(items: readonly AuditItem[]): Record<AuditCategory, number> {
  const scoreIn = (category: AuditCategory) =>
    auditScore(items.filter((item) => item.category === category));
  return {
    performance: scoreIn("performance"),
    reliability: scoreIn("reliability"),
    security: scoreIn("security"),
    "best-practices": scoreIn("best-practices"),
  };
}

/**
 * The colour a score reads in: good from 90, worth a look from 70.
 *
 * @param score - The score
 * @returns Its tone
 * @example
 * ```ts
 * scoreTone(88); // "warn"
 * ```
 */
export function scoreTone(score: number): ScoreTone {
  if (score >= 90) return "ok";
  return score >= 70 ? "warn" : "err";
}

/**
 * What a score is called: excellent from 90, good from 80, needing
 * attention from 70, at risk below.
 *
 * @param score - The score
 * @returns Its grade
 * @example
 * ```ts
 * gradeOf(88); // { label: "Good", tone: "warn" }
 * ```
 */
export function gradeOf(score: number): Grade {
  const tone = scoreTone(score);
  if (score >= 90) return { label: "Excellent", tone };
  if (score >= 80) return { label: "Good", tone };
  return { label: score >= 70 ? "Needs attention" : "At risk", tone };
}
