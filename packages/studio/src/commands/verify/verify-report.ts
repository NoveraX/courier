import type { RecordingCheck } from "@noverax/courier-mock/testing";

import { markdownCode, markdownText } from "../markdown-escape";

/** The checks of one recordings file. */
export interface CheckedFile {
  /** The file, relative to the project root */
  file: string;
  checks: readonly RecordingCheck[];
}

/** A file passed over, and why. */
export interface SkippedFile {
  file: string;
  reason: string;
}

/** What `verify` found, counted. */
export interface VerifyTotals {
  calls: number;
  broken: number;
  unchecked: number;
}

/**
 * Count what the checks found: the calls checked, the ones the definition
 * no longer fits, and the ones with a part left unchecked.
 *
 * @param files - The checks, by file
 * @returns The totals
 * @example
 * ```ts
 * totalsOf(files).broken; // → 0 when every recorded call still fits
 * ```
 */
export function totalsOf(files: readonly CheckedFile[]): VerifyTotals {
  const checks = files.flatMap((file) => file.checks);
  return {
    calls: checks.length,
    broken: checks.filter((check) => check.problems.length > 0).length,
    unchecked: checks.filter((check) => check.unchecked.length > 0).length,
  };
}

/**
 * The report as text for a terminal or a CI log: each file with its broken
 * calls and what broke each, the calls left partly unchecked, and the
 * totals last.
 *
 * @param files - The checks, by file
 * @param skipped - The files passed over
 * @returns The text
 * @example
 * ```ts
 * process.stdout.write(textReport(files, skipped));
 * ```
 */
export function textReport(files: readonly CheckedFile[], skipped: readonly SkippedFile[]): string {
  const lines: string[] = [];
  for (const { file, checks } of files) {
    const broken = checks.filter((check) => check.problems.length > 0);
    lines.push(
      `${file}  ${checks.length} calls${broken.length > 0 ? `, ${broken.length} broke` : ""}`,
    );
    for (const check of broken) {
      lines.push(`  BROKE  ${check.label}`);
      for (const problem of check.problems) lines.push(`         ${problemText(problem)}`);
    }
    for (const check of checks.filter((c) => c.unchecked.length > 0 && c.problems.length === 0)) {
      lines.push(`  UNCHECKED  ${check.label}: ${check.unchecked.join("; ")}`);
    }
  }
  for (const { file, reason } of skipped) lines.push(`${file}  passed over: ${reason}`);
  const { calls, broken, unchecked } = totalsOf(files);
  lines.push(
    "",
    `${calls} recorded calls checked: ${calls - broken} fit, ${broken} broke${unchecked > 0 ? `, ${unchecked} partly unchecked` : ""}`,
  );
  return `${lines.join("\n")}\n`;
}

/**
 * The report as Markdown for a pull request's comment or a CI job's
 * summary: the totals, a table of what broke — each endpoint once for each
 * way it broke, with how many calls and the first of them — and the calls
 * left partly unchecked folded away.
 *
 * @param files - The checks, by file
 * @param skipped - The files passed over
 * @returns The Markdown
 * @example
 * ```ts
 * appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdownReport(files, skipped));
 * ```
 */
export function markdownReport(
  files: readonly CheckedFile[],
  skipped: readonly SkippedFile[],
): string {
  const { calls, broken, unchecked } = totalsOf(files);
  const lines = [
    "## Recorded calls against the API definition",
    "",
    `**${calls - broken} of ${calls} recorded calls fit**${broken > 0 ? ` · ${broken} broke` : ""}${unchecked > 0 ? ` · ${unchecked} partly unchecked` : ""}`,
  ];
  const rows = brokenGroups(files).map(
    ({ endpoint, kinds, first, count, file }) =>
      `| \`${markdownCode(endpoint)}\` | ${count} | ${markdownText(kinds)} — ${markdownText(first)}${count > 1 ? ` (the first of ${count})` : ""} | \`${markdownCode(file)}\` |`,
  );
  if (rows.length > 0)
    lines.push(
      "",
      "| Endpoint | Calls | What broke | Recorded in |",
      "| --- | --- | --- | --- |",
      ...rows,
    );
  const partly = files.flatMap(({ checks }) =>
    checks.filter((check) => check.unchecked.length > 0),
  );
  if (partly.length > 0) {
    lines.push("", `<details><summary>${partly.length} calls partly unchecked</summary>`, "");
    for (const check of partly)
      lines.push(
        `- \`${markdownCode(check.label, { table: false })}\`: ${markdownText(check.unchecked.join("; "))}`,
      );
    lines.push("", "</details>");
  }
  for (const { file, reason } of skipped)
    lines.push(
      "",
      `\`${markdownCode(file, { table: false })}\` was passed over: ${markdownText(reason)}`,
    );
  return `${lines.join("\n")}\n`;
}

function problemText(problem: RecordingCheck["problems"][number]): string {
  return `${problem.kind.replace("-", " ")}: ${problemDetail(problem)}`;
}

function problemDetail(problem: RecordingCheck["problems"][number]): string {
  const issues = problem.issues?.map((issue) => `${issue.path} ${issue.message}`).join("; ");
  return `${problem.message}${issues ? ` (${issues})` : ""}`;
}

/** The broken calls of an endpoint that broke the same way, in one file. */
interface BrokenGroup {
  endpoint: string;
  /** The ways it broke: `path changed` */
  kinds: string;
  /** What broke the first of them, said in full */
  first: string;
  count: number;
  file: string;
}

function brokenGroups(files: readonly CheckedFile[]): BrokenGroup[] {
  const groups = new Map<string, BrokenGroup>();
  for (const { file, checks } of files) {
    for (const check of checks.filter((c) => c.problems.length > 0)) {
      const endpoint = check.source ? `${check.source} ${check.endpoint}` : check.endpoint;
      const kinds = [...new Set(check.problems.map((p) => p.kind.replace("-", " ")))].join(", ");
      const key = JSON.stringify([file, endpoint, kinds]);
      const group = groups.get(key);
      if (group) group.count++;
      else
        groups.set(key, {
          endpoint,
          kinds,
          first: check.problems.map(problemDetail).join("; "),
          count: 1,
          file,
        });
    }
  }
  return [...groups.values()];
}
