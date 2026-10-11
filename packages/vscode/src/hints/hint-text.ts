import { STATUS_CODES } from "node:http";

import { endpointPage, requestPage } from "../studio/studio-pages";
import type { EndpointStats } from "../studio/studio-types";

/* A stream's or a channel's calls are its connections, still open or ended. */
const WORDS = {
  call: { one: "call", many: "calls", waiting: "in flight" },
  stream: { one: "stream", many: "streams", waiting: "open" },
  channel: { one: "channel", many: "channels", waiting: "open" },
} as const;

type Words = (typeof WORDS)[keyof typeof WORDS];

function wordsOf(stats: EndpointStats): Words {
  return stats.kind === "stream" || stats.kind === "channel" ? WORDS[stats.kind] : WORDS.call;
}

function counted(count: number, words: Words): string {
  return `${count} ${count === 1 ? words.one : words.many}`;
}

/**
 * A duration as a hint writes it: `<1 ms`, `210 ms`, `1.4 s`.
 *
 * @param ms - The duration, in milliseconds
 * @returns The text
 * @example
 * ```ts
 * formatMs(1430); // "1.4 s"
 * ```
 */
export function formatMs(ms: number): string {
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * The line above a call: the endpoint, then how its calls went — how many,
 * how many failed and are still waiting, and how long nineteen in twenty
 * took; for a stream or a channel, its connections and how many are open.
 * The source leads when the call may reach endpoints of two sources.
 *
 * @param stats - How the endpoint's calls went
 * @param withSource - Whether to name the source too
 * @returns The line
 * @example
 * ```ts
 * hintTitle(stats, false); // "orders.place · 34 calls · 1 failed · p95 210 ms"
 * ```
 */
export function hintTitle(stats: EndpointStats, withSource: boolean): string {
  const name = withSource ? `${stats.source} ${stats.endpoint}` : stats.endpoint;
  return `${name} · ${figuresOf(stats)}`;
}

/**
 * How an endpoint's calls went, without its name: how many, how many failed
 * and are still waiting, and how long nineteen in twenty took — as the
 * Courier view writes it beside the endpoint.
 *
 * @param stats - How the endpoint's calls went
 * @returns The figures
 * @example
 * ```ts
 * figuresOf(stats); // "34 calls · 1 failed · p95 210 ms"
 * ```
 */
export function figuresOf(stats: EndpointStats): string {
  const words = wordsOf(stats);
  if (stats.calls === 0) return `no ${words.many} yet`;
  const parts = [counted(stats.calls, words)];
  if (stats.failed > 0) parts.push(`${stats.failed} failed`);
  if (stats.pending > 0) parts.push(`${stats.pending} ${words.waiting}`);
  if (stats.p95 !== undefined) parts.push(`p95 ${formatMs(stats.p95)}`);
  return parts.join(" · ");
}

/**
 * The hover over a call: the endpoint, its calls, how long they took, the
 * statuses they ended with, the latest failure and why, and links to the
 * endpoint in Studio and to the failed request in its inspector — which
 * open where `courier.studio.openIn` says, so the Markdown is shown trusted
 * to run that one command.
 *
 * @param stats - How the endpoint's calls went
 * @param studio - Studio's address
 * @param now - The time now, for how long ago the latest failure was
 * @returns Markdown
 * @example
 * ```ts
 * hoverText(stats, "http://localhost:6280", Date.now());
 * ```
 */
export function hoverText(stats: EndpointStats, studio: string, now: number): string {
  const lines = [`**${stats.source} · ${stats.endpoint}** in Courier Studio`, ""];
  const words = wordsOf(stats);
  if (stats.calls === 0) {
    lines.push(`No ${words.many} yet in this session.`);
  } else {
    const waiting = stats.pending > 0 ? `, ${stats.pending} ${words.waiting}` : "";
    lines.push(`${counted(stats.calls, words)}, ${stats.failed} failed${waiting}`);
    if (stats.p50 !== undefined && stats.p95 !== undefined) {
      lines.push("", `p50 ${formatMs(stats.p50)} · p95 ${formatMs(stats.p95)}`);
    }
    const statuses = Object.entries(stats.statuses).map(([status, count]) => `${status} ×${count}`);
    if (statuses.length > 0) lines.push("", `Statuses: ${statuses.join(", ")}`);
    if (stats.lastFailure)
      lines.push(
        "",
        `Last failure ${ago(now - stats.lastFailure.at)}: ${failureText(stats.lastFailure)}`,
      );
  }
  const links = [
    `[Open in Studio](${studioLink(endpointPage(studio, stats.source, stats.endpoint))})`,
  ];
  const failed = stats.lastFailure?.request;
  if (failed) links.push(`[Open the latest failure](${studioLink(requestPage(studio, failed))})`);
  lines.push("", links.join(" · "));
  return lines.join("\n");
}

/**
 * Why an endpoint's latest call failed, as Markdown says it: the API wrote
 * the message, so it is shown as text, never as Markdown that could link
 * anywhere; an error that says no more than its status, as `HTTP 409`
 * does, is named by the status and its reason phrase instead.
 *
 * @param failure - The latest failure
 * @returns Its reason, as Markdown text
 * @example
 * ```ts
 * failureText({ at, status: 409, message: "HTTP 409" }); // "409 Conflict"
 * ```
 */
export function failureText(failure: NonNullable<EndpointStats["lastFailure"]>): string {
  const { status } = failure;
  if (status !== undefined && failure.message.trim() === `HTTP ${status}`) {
    return [status, STATUS_CODES[status]].filter(Boolean).join(" ");
  }
  const message = failure.message
    .replace(/[\r\n]+/g, " ")
    .slice(0, 160)
    .replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, "\\$&");
  return status === undefined ? message : `${status} ${message}`;
}

/**
 * How long ago something happened, as a hint says it: `12 s ago`,
 * `3 min ago`, `2 h ago`.
 *
 * @param ms - How long ago, in milliseconds
 * @returns The text
 * @example
 * ```ts
 * ago(125_000); // "2 min ago"
 * ```
 */
export function ago(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
}

/**
 * A link that opens one of Studio's pages where the settings say: the
 * editor's own tab, or the browser.
 *
 * @param page - The page's address
 * @returns The command link
 * @example
 * ```ts
 * studioLink("http://localhost:6280/audit"); // "command:courier.openStudioPage?%5B%22http…"
 * ```
 */
export function studioLink(page: string): string {
  return `command:courier.openStudioPage?${encodeURIComponent(JSON.stringify([page]))}`;
}
