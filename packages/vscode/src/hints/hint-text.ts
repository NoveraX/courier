import { STATUS_CODES } from "node:http";

import type { EndpointStats } from "../studio/studio-api";

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
  const words = wordsOf(stats);
  if (stats.calls === 0) return `${name} · no ${words.many} yet`;
  const parts = [name, counted(stats.calls, words)];
  if (stats.failed > 0) parts.push(`${stats.failed} failed`);
  if (stats.pending > 0) parts.push(`${stats.pending} ${words.waiting}`);
  if (stats.p95 !== undefined) parts.push(`p95 ${formatMs(stats.p95)}`);
  return parts.join(" · ");
}

/**
 * The hover over a call: the endpoint, its calls, how long they took, the
 * statuses they ended with, the latest failure and why, and a link to the
 * endpoint in Studio.
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
  lines.push("", `[Open in Studio](${endpointPage(studio, stats.source, stats.endpoint)})`);
  return lines.join("\n");
}

/**
 * The endpoint's page in Studio: the Explorer, with the endpoint open.
 *
 * @param studio - Studio's address
 * @param source - The endpoint's source
 * @param endpoint - Its call in the client
 * @returns The address
 * @example
 * ```ts
 * endpointPage("http://localhost:6280", "shop", "orders.place"); // ".../explorer/endpoints?endpoint=shop.orders.place"
 * ```
 */
export function endpointPage(studio: string, source: string, endpoint: string): string {
  const page = new URL("/explorer/endpoints", studio);
  page.searchParams.set("endpoint", `${source}.${endpoint}`);
  return page.toString();
}

/*
 * The API wrote the message: it is shown as text, never as Markdown that
 * could link anywhere. An error that says no more than its status, as
 * `HTTP 409` does, is named by the status and its reason phrase instead.
 */
function failureText(failure: NonNullable<EndpointStats["lastFailure"]>): string {
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

function ago(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
}
