import { ago, figuresOf, formatMs } from "../hints/hint-text";
import type { RecordedRequest } from "../studio/live-types";
import type { EndpointStats, Finding } from "../studio/studio-types";

/* What a chat answer shows of each: enough to act on, short enough to read. */
const MOST_ENDPOINTS = 12;
const MOST_REQUESTS = 10;
const MOST_FINDINGS = 10;

/**
 * How the endpoints are doing, as a chat answer says it: the totals, the
 * endpoints with failed calls first, then the slowest, each with its
 * figures and its latest failure.
 *
 * @param stats - Every endpoint's figures
 * @param now - The time now
 * @returns Markdown
 * @example
 * ```ts
 * statusFacts(stats, Date.now());
 * ```
 */
export function statusFacts(stats: readonly EndpointStats[], now: number): string {
  const called = stats.filter((each) => each.calls > 0);
  const failing = called.filter((each) => each.failed > 0).sort((a, b) => b.failed - a.failed);
  const slow = called
    .filter((each) => each.failed === 0 && each.p95 !== undefined)
    .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0));
  const calls = called.reduce((sum, each) => sum + each.calls, 0);
  const lines = [
    `**${counted(stats.length, "endpoint")}**, ${called.length} called, ${counted(calls, "call")} in this session; ${failing.length} with failed calls.`,
  ];
  if (called.length > 0) lines.push("");
  for (const each of [...failing, ...slow].slice(0, MOST_ENDPOINTS)) {
    const failure = each.lastFailure
      ? ` — last failure ${ago(now - each.lastFailure.at)}: ${plain(each.lastFailure.message)}`
      : "";
    lines.push(`- \`${each.source}.${each.endpoint}\` · ${figuresOf(each)}${failure}`);
  }
  return lines.join("\n");
}

/**
 * One endpoint, as a chat answer says it: its figures, its latest failure
 * and why, and its latest calls.
 *
 * @param stats - The endpoint's figures
 * @param requests - Its latest requests, newest first
 * @param now - The time now
 * @returns Markdown
 * @example
 * ```ts
 * endpointFacts(stats, requests, Date.now());
 * ```
 */
export function endpointFacts(
  stats: EndpointStats,
  requests: readonly RecordedRequest[],
  now: number,
): string {
  const lines = [`**\`${stats.source}.${stats.endpoint}\`** · ${figuresOf(stats)}`];
  if (stats.lastFailure) {
    const { at, message } = stats.lastFailure;
    lines.push("", `Last failure ${ago(now - at)}: ${plain(message)}`);
  }
  if (requests.length > 0) lines.push("", "Latest calls:", requestFacts(requests, now));
  return lines.join("\n");
}

/**
 * The latest failed requests, as a chat answer lists them.
 *
 * @param requests - The failed requests, newest first
 * @param now - The time now
 * @returns Markdown
 * @example
 * ```ts
 * failureFacts(requests, Date.now());
 * ```
 */
export function failureFacts(requests: readonly RecordedRequest[], now: number): string {
  return requests.length === 0
    ? "No request has failed in this session."
    : requestFacts(requests, now);
}

/**
 * Requests, as a chat answer lists them: the endpoint, the method, the
 * status and the time it took, when, and why it failed.
 *
 * @param requests - The requests, newest first
 * @param now - The time now
 * @returns Markdown
 * @example
 * ```ts
 * requestFacts(requests, Date.now());
 * ```
 */
export function requestFacts(requests: readonly RecordedRequest[], now: number): string {
  return requests
    .slice(0, MOST_REQUESTS)
    .map((request) => {
      const method = request.method ? ` ${request.method}` : "";
      const status = request.state === "pending" ? "pending" : (request.status ?? "no answer");
      const took = request.durationMs !== undefined ? ` in ${formatMs(request.durationMs)}` : "";
      const why =
        request.error && request.error !== `HTTP ${status}` ? `: ${plain(request.error)}` : "";
      return `- \`${request.source}.${request.endpoint}\`${method} → ${status}${took}, ${ago(now - request.startedAt)}${why}`;
    })
    .join("\n");
}

/**
 * The audit's findings, as a chat answer lists them: the gravest first,
 * each with what it saw at which endpoints and what to do.
 *
 * @param findings - The findings
 * @returns Markdown
 * @example
 * ```ts
 * auditFacts(findings);
 * ```
 */
export function auditFacts(findings: readonly Finding[]): string {
  if (findings.length === 0) return "The audit found nothing to fix in this session's requests.";
  const rank = { error: 0, warning: 1, hint: 2 } as const;
  return [...findings]
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .slice(0, MOST_FINDINGS)
    .map((finding) => {
      const where = finding.endpoints
        .slice(0, 4)
        .map(
          (each) =>
            `\`${each.source}.${each.endpoint}\`${each.detail ? ` (${plain(each.detail)})` : ""}`,
        )
        .join(", ");
      const advice = finding.suggestion ? ` ${plain(finding.suggestion)}` : "";
      return `- **${plain(finding.title)}** (${finding.severity}) at ${where}.${advice}`;
    })
    .join("\n");
}

function counted(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/* What an API or a person wrote, as text: no Markdown of its own, on one line. */
function plain(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")
    .slice(0, 200)
    .replace(/[\\`*_[\]<>|]/g, "\\$&");
}
