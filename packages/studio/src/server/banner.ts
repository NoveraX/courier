/**
 * Premium startup banner and structured runtime logger.
 * Inspired by NestJS console output with Courier branding.
 */

import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";
import { startupIssues } from "./startup-issues";

// ── ANSI palette ─────────────────────────────────────────────────────────────

const R = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";

const fg = (r: number, g: number, b: number): string => `\x1b[38;2;${r};${g};${b}m`;

const WHITE = fg(229, 231, 235);
const GRAY = fg(113, 113, 122);
const DARK = fg(63, 63, 70);
const GREEN = fg(52, 211, 153);
const RED = fg(248, 113, 113);
const AMBER = fg(251, 191, 36);
const BRAND = fg(139, 92, 246);
const BRAND_LIGHT = fg(167, 139, 250);

// ── Gradient ─────────────────────────────────────────────────────────────────

const STOPS: [number, number, number][] = [
  [139, 92, 246],
  [124, 104, 244],
  [109, 118, 240],
  [94, 140, 234],
  [79, 162, 228],
  [64, 184, 222],
  [49, 196, 230],
  [34, 211, 238],
];

function gradient(text: string): string {
  const chars = text.split("");
  const len = STOPS.length;
  const fb: [number, number, number] = STOPS[0] ?? [139, 92, 246];
  return (
    chars
      .map((ch, i) => {
        if (ch === " ") return ch;
        const t = chars.length > 1 ? i / (chars.length - 1) : 0;
        const idx = t * (len - 1);
        const a = STOPS[Math.floor(idx)] ?? fb;
        const b = STOPS[Math.min(Math.floor(idx) + 1, len - 1)] ?? a;
        const f = idx - Math.floor(idx);
        return `${fg(
          Math.round(a[0] + (b[0] - a[0]) * f),
          Math.round(a[1] + (b[1] - a[1]) * f),
          Math.round(a[2] + (b[2] - a[2]) * f),
        )}${BOLD}${ch}`;
      })
      .join("") + R
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getNetworkAddress(): string | undefined {
  for (const interfaces of Object.values(networkInterfaces())) {
    if (!interfaces) continue;
    for (const net of interfaces) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return undefined;
}

function getVersion(): string {
  try {
    const req = createRequire(import.meta.url);
    return (req("../../package.json") as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

function shortTime(): string {
  const d = new Date();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function cleanOrigin(raw: string): string {
  if (raw === "::1" || raw === "::ffff:127.0.0.1" || raw === "127.0.0.1") return "localhost";
  let cleaned = raw;
  if (cleaned.startsWith("::ffff:")) cleaned = cleaned.slice(7);
  if (cleaned.startsWith("http://")) cleaned = cleaned.slice(7);
  if (cleaned.startsWith("https://")) cleaned = cleaned.slice(8);
  return cleaned;
}

// ── Prefix ───────────────────────────────────────────────────────────────────

const pid = process.pid;

function prefix(): string {
  return `${BRAND}[Courier]${R} ${WHITE}${pid}${R}  ${DARK}–${R} ${DIM}${shortTime()}${R}`;
}

// ── Box ──────────────────────────────────────────────────────────────────────

function box(lines: string[], widths: number[]): string[] {
  const inner = Math.max(...widths) + 4;
  const t = `${DARK}╭${"─".repeat(inner)}╮${R}`;
  const b = `${DARK}╰${"─".repeat(inner)}╯${R}`;
  const e = `${DARK}│${R}${" ".repeat(inner)}${DARK}│${R}`;
  const rows = lines.map((l, i) => {
    const pad = inner - 2 - (widths[i] ?? 0);
    return `${DARK}│${R}  ${l}${" ".repeat(Math.max(0, pad))}${DARK}│${R}`;
  });
  return [t, e, ...rows, e, b];
}

// ── Banner ───────────────────────────────────────────────────────────────────

export function printBanner(host: string, port: number): void {
  const issues = startupIssues();

  /* Clearing wipes the scrollback too, so anything already reported would be
     unrecoverable rather than merely scrolled away. A clean start earns a
     clean screen; a start with problems keeps its history. */
  if (issues.length === 0) process.stdout.write("\x1bc\x1b[3J\x1b[2J\x1b[H");

  const ver = getVersion();
  const net = getNetworkAddress();
  const local = `http://${host}:${port}`;
  const network = net ? `http://${net}:${port}` : "";

  const content = [
    `${gradient("Courier Studio")}  ${DIM}${ITALIC}v${ver}${R}`,
    "",
    `${GRAY}Local${R}     ${WHITE}${local}${R}`,
  ];
  const widths = [12 + 2 + 1 + ver.length, 0, 5 + 5 + local.length];

  if (network) {
    content.push(`${GRAY}Network${R}   ${WHITE}${network}${R}`);
    widths.push(7 + 3 + network.length);
  }

  const lines = box(content, widths);
  console.log(["", ...lines.map((l) => `  ${l}`), ""].join("\n"));

  /* Restated under the banner: a problem reported during startup was printed
     before this point, where it is easy to miss, and a banner over a clean
     screen otherwise reads as everything being fine. */
  for (const issue of issues) {
    console.log(`  ${AMBER}!${R} ${issue}`);
  }
  if (issues.length > 0) console.log("");
}

// ── Runtime logs ─────────────────────────────────────────────────────────────

export function logAppConnect(framework: string, origin: string): void {
  const host = cleanOrigin(origin);
  console.log(
    `${prefix()}   ${GREEN}${BOLD} CONN${R}  ${BRAND_LIGHT}[${framework}]${R} ${WHITE}connected${R} ${DIM}from ${host}${R}`,
  );
}

export function logAppDisconnect(framework: string, origin: string): void {
  const host = cleanOrigin(origin);
  console.log(
    `${prefix()}   ${RED}${BOLD} DROP${R}  ${BRAND_LIGHT}[${framework}]${R} ${WHITE}disconnected${R} ${DIM}from ${host}${R}`,
  );
}

export function logMockServerStart(name: string, url: string): void {
  console.log(
    `${prefix()}   ${AMBER}${BOLD} MOCK${R}  ${BRAND_LIGHT}[${name}]${R} ${WHITE}ready${R} ${DIM}at ${url}${R}`,
  );
}

export function logMockServerStop(name: string): void {
  console.log(
    `${prefix()}   ${RED}${BOLD} MOCK${R}  ${BRAND_LIGHT}[${name}]${R} ${WHITE}stopped${R}`,
  );
}
