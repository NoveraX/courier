import { formatLink } from "./format-link";
import type { TerminalStyle } from "./terminal-style";

/** One row of a banner: what it names, and its value. */
export interface BannerRow {
  readonly label: string;
  /** An address is shown as a link; anything else as it is. */
  readonly value: string;
}

/** What a command prints once it is ready. */
export interface Banner {
  /** The product, as the title reads: `Courier Studio`. */
  readonly product: string;
  readonly version: string;
  /** How long the process took to become ready, in milliseconds. */
  readonly readyInMs?: number | undefined;
  readonly rows: readonly BannerRow[];
  /** A sentence under the rows. */
  readonly note?: string | undefined;
  /** Problems found on the way, restated where they are seen. */
  readonly issues?: readonly string[] | undefined;
}

/* Wide enough for "Network" and its gap; a longer label widens every row. */
const LABEL_WIDTH = 10;

function readyIn(ms: number, { bold, dim }: TerminalStyle): string {
  const [amount, unit] = ms < 1000 ? [String(Math.round(ms)), "ms"] : [(ms / 1000).toFixed(1), "s"];
  return `${dim("ready in")} ${bold(amount)} ${dim(unit)}`;
}

/**
 * A banner: the product and its version, how long it took to be ready, a
 * row per address or file, a note, and any problem met on the way.
 *
 * @param banner - What it says
 * @param style - The style of the stream it is written to
 * @returns The banner's lines, with a blank line above and below
 * @example
 * ```ts
 * console.log(
 *   formatBanner(
 *     { product: "Courier Server", version: "1.0.0", rows: [{ label: "Local", value: url }] },
 *     styleFor(process.stdout),
 *   ),
 * );
 * ```
 */
export function formatBanner(banner: Banner, style: TerminalStyle): string {
  const { bold, brand, dim, yellow, glyphs } = style;
  const ready = banner.readyInMs === undefined ? "" : `  ${readyIn(banner.readyInMs, style)}`;
  const lines = ["", `  ${bold(brand(banner.product))} ${dim(`v${banner.version}`)}${ready}`, ""];
  const width = Math.max(LABEL_WIDTH, ...banner.rows.map((row) => row.label.length + 2));
  for (const { label, value } of banner.rows) {
    const shown = /^https?:\/\//.test(value) ? formatLink(value, style) : value;
    lines.push(
      `  ${brand(glyphs.arrow)}  ${bold(label)}${" ".repeat(width - label.length)}${shown}`,
    );
  }
  if (banner.note !== undefined) lines.push("", `  ${dim(banner.note)}`);
  const issues = banner.issues ?? [];
  if (issues.length > 0) lines.push("");
  for (const issue of issues) lines.push(`  ${yellow(bold(glyphs.warn))}  ${issue}`);
  lines.push("");
  return lines.join("\n");
}
