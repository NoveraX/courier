import type { ContractResult } from "./validator";

/** Aggregated contract validation report */
export interface ContractReport {
  passed: number;
  failed: number;
  skipped: number;
  results: ContractResult[];
  /** Format as Markdown */
  toMarkdown(): string;
  /** Format as JUnit XML (for CI) */
  toJUnit(): string;
  /** Format as TAP (Test Anything Protocol) */
  toTAP(): string;
  /** Format as JSON */
  toJSON(): string;
}

/** Create a report from validation results */
export function createContractReport(results: ContractResult[]): ContractReport {
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;

  return {
    passed,
    failed,
    skipped,
    results,
    toMarkdown: () => formatMarkdown(results, passed, failed, skipped),
    toJUnit: () => formatJUnit(results, passed, failed, skipped),
    toTAP: () => formatTAP(results),
    toJSON: () => JSON.stringify({ passed, failed, skipped, results }, null, 2),
  };
}

function formatMarkdown(
  results: ContractResult[],
  passed: number,
  failed: number,
  skipped: number,
): string {
  const lines: string[] = [
    "# Contract Validation Report",
    "",
    `**Passed:** ${passed} | **Failed:** ${failed} | **Skipped:** ${skipped}`,
    "",
  ];

  for (const r of results) {
    const icon = r.status === "pass" ? "✅" : r.status === "fail" ? "❌" : "⏭️";
    const target = r.target ? ` (${r.target})` : "";
    const reason = r.status === "skip" && r.reason ? ` — ${r.reason}` : "";
    lines.push(`${icon} \`${r.group}.${r.method}\`${target}${reason}`);

    if (r.issues?.length) {
      for (const issue of r.issues) {
        lines.push(`  - \`${issue.path}\`: ${issue.message}`);
      }
    }
  }

  return lines.join("\n");
}

function formatJUnit(
  results: ContractResult[],
  passed: number,
  failed: number,
  skipped: number,
): string {
  const total = passed + failed + skipped;
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites tests="${total}" failures="${failed}" skipped="${skipped}">`,
    '  <testsuite name="contract-validation">',
  ];

  for (const r of results) {
    const name = `${r.group}.${r.method}${r.target ? ` (${r.target})` : ""}`;

    if (r.status === "pass") {
      lines.push(`    <testcase name="${escapeXml(name)}" />`);
    } else if (r.status === "skip") {
      const message = r.reason ? ` message="${escapeXml(r.reason)}"` : "";
      lines.push(`    <testcase name="${escapeXml(name)}"><skipped${message} /></testcase>`);
    } else {
      const msg = r.issues?.map((i) => `${i.path}: ${i.message}`).join("; ") ?? "Validation failed";
      lines.push(`    <testcase name="${escapeXml(name)}">`);
      lines.push(`      <failure message="${escapeXml(msg)}" />`);
      lines.push("    </testcase>");
    }
  }

  lines.push("  </testsuite>", "</testsuites>");
  return lines.join("\n");
}

function formatTAP(results: ContractResult[]): string {
  const lines: string[] = [`TAP version 13`, `1..${results.length}`];

  results.forEach((r, i) => {
    const name = `${r.group}.${r.method}${r.target ? ` (${r.target})` : ""}`;
    if (r.status === "pass") {
      lines.push(`ok ${i + 1} - ${name}`);
    } else if (r.status === "skip") {
      lines.push(`ok ${i + 1} - ${name} # SKIP${r.reason ? ` ${r.reason}` : ""}`);
    } else {
      lines.push(`not ok ${i + 1} - ${name}`);
      for (const issue of r.issues ?? []) {
        lines.push(`  ---`);
        lines.push(`  path: ${issue.path}`);
        lines.push(`  message: ${issue.message}`);
        lines.push(`  ...`);
      }
    }
  });

  return lines.join("\n");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
