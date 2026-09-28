/**
 * The startup banner: Studio's version and the addresses it answers at.
 *
 * Colour and the screen reset are for a terminal. Written into a pipe — a
 * log file, CI, `concurrently`, turbo — the reset wiped the other processes'
 * output and every line carried escape codes, so both now need a TTY, and
 * colour also honours NO_COLOR and FORCE_COLOR.
 */

import { startupIssues } from "./startup-issues";
import type { StudioUrls } from "./studio-urls";

interface Palette {
  reset: string;
  dim: string;
  label: string;
  value: string;
  frame: string;
  warn: string;
  title: (text: string) => string;
}

const rgb = (r: number, g: number, b: number): string => `\x1b[38;2;${r};${g};${b}m`;

/** Brand violet to cyan, applied across the title. */
const GRADIENT: ReadonlyArray<readonly [number, number, number]> = [
  [139, 92, 246],
  [109, 118, 240],
  [79, 162, 228],
  [34, 211, 238],
];

function gradient(text: string): string {
  const last = Math.max(text.length - 1, 1);
  const stops = GRADIENT.length - 1;
  const painted = [...text].map((ch, i) => {
    if (ch === " ") return ch;
    const at = (i / last) * stops;
    const from = GRADIENT[Math.floor(at)] ?? GRADIENT[0];
    const to = GRADIENT[Math.min(Math.floor(at) + 1, stops)] ?? from;
    const mix = (k: 0 | 1 | 2) =>
      Math.round((from?.[k] ?? 0) + ((to?.[k] ?? 0) - (from?.[k] ?? 0)) * (at % 1));
    return `\x1b[1m${rgb(mix(0), mix(1), mix(2))}${ch}`;
  });
  return `${painted.join("")}\x1b[0m`;
}

const COLOURS: Palette = {
  reset: "\x1b[0m",
  dim: "\x1b[2m\x1b[3m",
  label: rgb(113, 113, 122),
  value: rgb(229, 231, 235),
  frame: rgb(63, 63, 70),
  warn: rgb(251, 191, 36),
  title: gradient,
};

const PLAIN: Palette = {
  reset: "",
  dim: "",
  label: "",
  value: "",
  frame: "",
  warn: "",
  title: (text) => text,
};

/** Whether a stream should get colour: FORCE_COLOR wins, then NO_COLOR, then whether it is a terminal. */
export function wantsColour(
  stream: { isTTY?: boolean },
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "0") return true;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  return stream.isTTY === true;
}

/** A row of the box, kept as plain and coloured text so its width is measured, not counted by hand. */
interface Row {
  plain: string;
  styled: string;
}

function row(p: Palette, label: string, value: string): Row {
  const gap = " ".repeat(10 - label.length);
  return {
    plain: `${label}${gap}${value}`,
    styled: `${p.label}${label}${p.reset}${gap}${p.value}${value}${p.reset}`,
  };
}

function box(p: Palette, rows: readonly Row[]): string[] {
  const inner = Math.max(...rows.map((r) => r.plain.length)) + 4;
  const line = (left: string, fill: string, right: string) =>
    `${p.frame}${left}${fill.repeat(inner)}${right}${p.reset}`;
  const body = rows.map(
    (r) =>
      `${p.frame}│${p.reset}  ${r.styled}${" ".repeat(inner - 2 - r.plain.length)}${p.frame}│${p.reset}`,
  );
  return [
    line("╭", "─", "╮"),
    line("│", " ", "│"),
    ...body,
    line("│", " ", "│"),
    line("╰", "─", "╯"),
  ];
}

/**
 * Print the banner, and restate any problem already reported during startup.
 *
 * @param version - Studio's version.
 * @param urls - Where Studio answers.
 */
export function printBanner(version: string, urls: StudioUrls): void {
  const issues = startupIssues();
  const p = wantsColour(process.stdout) ? COLOURS : PLAIN;

  /* Clearing wipes the scrollback too, so anything already reported would be
     unrecoverable rather than merely scrolled away. A clean start earns a
     clean screen; a start with problems keeps its history. */
  if (issues.length === 0 && process.stdout.isTTY === true) {
    process.stdout.write("\x1bc\x1b[3J\x1b[2J\x1b[H");
  }

  const title = `Courier Studio  v${version}`;
  const rows: Row[] = [
    { plain: title, styled: `${p.title("Courier Studio")}  ${p.dim}v${version}${p.reset}` },
    { plain: "", styled: "" },
  ];
  if (urls.local) rows.push(row(p, "Local", urls.local));
  for (const url of urls.network) rows.push(row(p, "Network", url));
  /* The links carry the project's token; a page opened without it can only look. */
  const note = "Open a link above: without its token a page can only look.";
  rows.push({ plain: "", styled: "" }, { plain: note, styled: `${p.dim}${note}${p.reset}` });

  console.log(["", ...box(p, rows).map((l) => `  ${l}`), ""].join("\n"));

  /* Restated under the banner: a problem reported during startup was printed
     before this point, where it is easy to miss, and a banner over a clean
     screen otherwise reads as everything being fine. */
  for (const issue of issues) console.log(`  ${p.warn}!${p.reset} ${issue}`);
  if (issues.length > 0) console.log("");
}
