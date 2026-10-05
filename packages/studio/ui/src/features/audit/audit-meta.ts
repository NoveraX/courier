import type { AuditCategory, AuditSeverity } from "./types";

/** The highest score an audit gives. */
export const MAX_SCORE = 100;

/** The categories in the order a report lists them. */
export const CATEGORY_ORDER: readonly AuditCategory[] = [
  "performance",
  "reliability",
  "security",
  "best-practices",
];

/** What each category is called in a report. */
export const CATEGORY_LABEL: Readonly<Record<AuditCategory, string>> = {
  performance: "Performance",
  reliability: "Reliability",
  security: "Security",
  "best-practices": "Best Practices",
};

/** What a finding of each severity takes from the score; a check passed adds. */
export const SEVERITY_WEIGHT: Readonly<Record<AuditSeverity, number>> = {
  error: -15,
  warning: -5,
  hint: -2,
  pass: 1,
};
