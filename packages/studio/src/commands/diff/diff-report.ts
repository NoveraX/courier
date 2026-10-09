import type { EndpointChanges } from "./definition-diff";

/** What the recorded calls say of the changes: how many each endpoint has, and how many no longer fit. */
export interface RecordedImpact {
  /** Recorded calls by `source endpoint` */
  calls: ReadonlyMap<string, number>;
  /** Recorded calls the new definition no longer fits, when recordings were read */
  failing: number | undefined;
}

/** The changes, counted. */
export interface DiffTotals {
  endpoints: number;
  breaking: number;
  warnings: number;
  safe: number;
}

/**
 * Count the changes by how much they matter.
 *
 * @param changed - The endpoints that changed
 * @returns The totals
 * @example
 * ```ts
 * totalsOf(diffDefinitions(base, head)).breaking; // → 0 while nothing breaks
 * ```
 */
export function diffTotals(changed: readonly EndpointChanges[]): DiffTotals {
  const all = changed.flatMap((entry) => entry.changes);
  return {
    endpoints: changed.length,
    breaking: all.filter((change) => change.severity === "breaking").length,
    warnings: all.filter((change) => change.severity === "warning").length,
    safe: all.filter((change) => change.severity === "info").length,
  };
}

/**
 * The changes as text for a terminal or a CI log: each endpoint with its
 * changes, most breaking first, and how many recorded calls it has.
 *
 * @param changed - The endpoints that changed
 * @param impact - What the recorded calls say
 * @returns The text
 * @example
 * ```ts
 * process.stdout.write(diffText(changed, impact));
 * ```
 */
export function diffText(changed: readonly EndpointChanges[], impact: RecordedImpact): string {
  const lines: string[] = [];
  for (const entry of changed) {
    const recorded = impact.calls.get(`${entry.source} ${entry.endpoint}`);
    lines.push(
      `${entry.source} ${entry.endpoint} · ${entry.route}${recorded ? `  (${recorded} recorded calls)` : ""}`,
    );
    for (const change of entry.changes)
      lines.push(`  ${LABEL[change.severity]}  ${change.message}`);
  }
  lines.push("", summaryOf(changed, impact));
  return `${lines.join("\n")}\n`;
}

/**
 * The changes as Markdown for a pull request: the summary, a table of what
 * breaks callers and what may, with the recorded calls of each endpoint,
 * and the safe changes folded away.
 *
 * @param changed - The endpoints that changed
 * @param impact - What the recorded calls say
 * @returns The Markdown
 * @example
 * ```ts
 * appendFileSync(process.env.GITHUB_STEP_SUMMARY, diffMarkdown(changed, impact));
 * ```
 */
export function diffMarkdown(changed: readonly EndpointChanges[], impact: RecordedImpact): string {
  const rows = changed.flatMap((entry) =>
    entry.changes
      .filter((change) => change.severity !== "info")
      .map(
        (change) =>
          `| ${change.severity === "breaking" ? "Breaking" : "May break"} | \`${cell(`${entry.source} ${entry.endpoint}`)}\` | ${cell(change.message)} | ${impact.calls.get(`${entry.source} ${entry.endpoint}`) ?? 0} |`,
      ),
  );
  const safe = changed.flatMap((entry) =>
    entry.changes
      .filter((change) => change.severity === "info")
      .map(
        (change) => `- \`${cell(`${entry.source} ${entry.endpoint}`)}\`: ${cell(change.message)}`,
      ),
  );
  const lines = ["## API definition changes", "", `**${summaryOf(changed, impact)}**`];
  if (rows.length > 0)
    lines.push(
      "",
      "| | Endpoint | Change | Recorded calls |",
      "| --- | --- | --- | --- |",
      ...rows,
    );
  if (safe.length > 0)
    lines.push(
      "",
      `<details><summary>${safe.length} safe changes</summary>`,
      "",
      ...safe,
      "",
      "</details>",
    );
  return `${lines.join("\n")}\n`;
}

const LABEL = { breaking: "BREAKING", warning: "MAY BREAK", info: "safe" } as const;

function summaryOf(changed: readonly EndpointChanges[], impact: RecordedImpact): string {
  const { endpoints, breaking, warnings, safe } = diffTotals(changed);
  if (endpoints === 0) return "No endpoint changed";
  const failing =
    impact.failing === undefined ? "" : `; ${impact.failing} recorded calls no longer fit`;
  return `${endpoints} endpoints changed: ${breaking} breaking, ${warnings} that may break, ${safe} safe${failing}`;
}

/* A table cell holds no pipe or line break of its own, and no backtick that would end the code span. */
function cell(text: string): string {
  return text
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ")
    .replace(/`/g, "'");
}
