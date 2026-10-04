import type { ColorLevel } from "./color-level";
import type { Glyphs } from "./glyphs";
import { glyphsFor } from "./glyphs";

/** A function that styles a piece of text, or leaves it as it is. */
export type Paint = (text: string) => string;

/**
 * How to style text for one stream: weights, the brand colour, the status
 * colours and the symbols.
 *
 * The status colours are the terminal's own 16, so they follow its theme and
 * stay legible on a light background as on a dark one; only the brand colour
 * is fixed, in a violet that reads on both. Text without a colour keeps the
 * terminal's foreground.
 */
export interface TerminalStyle {
  /** How many colours the stream shows; `0` paints nothing. */
  readonly level: ColorLevel;
  readonly glyphs: Glyphs;
  readonly bold: Paint;
  readonly dim: Paint;
  readonly brand: Paint;
  readonly red: Paint;
  readonly green: Paint;
  readonly yellow: Paint;
  readonly cyan: Paint;
  readonly magenta: Paint;
}

const PLAIN: Paint = (text) => text;

/* Violet 500 in each colour space: 24-bit, the nearest of the 256, and the
   theme's magenta. */
const BRAND: Record<Exclude<ColorLevel, 0>, string> = {
  24: "38;2;139;92;246",
  8: "38;5;99",
  4: "35",
};

/* A style nested inside another closes with the same code as its parent —
   bold inside dim, a colour inside a colour — so each inner close re-opens
   the outer style, and the rest of the outer text keeps it. */
function wrap(open: string, close: string): Paint {
  const start = `\x1b[${open}m`;
  const end = `\x1b[${close}m`;
  const resume = `${end}${start}`;
  return (text) => `${start}${text.replaceAll(end, resume)}${end}`;
}

const cache = new Map<string, TerminalStyle>();

/**
 * The style for a colour level and a terminal's symbols.
 *
 * @param level - How many colours the stream shows
 * @param unicode - Whether the terminal draws Unicode symbols
 * @returns The style; the same object for the same arguments
 * @example
 * ```ts
 * const style = createTerminalStyle(colorLevel(process.stdout), supportsUnicode());
 * console.log(style.bold("Courier"));
 * ```
 */
export function createTerminalStyle(level: ColorLevel, unicode: boolean): TerminalStyle {
  const key = `${level}:${unicode}`;
  const known = cache.get(key);
  if (known !== undefined) return known;
  const paint = (open: string, close = "39"): Paint => (level === 0 ? PLAIN : wrap(open, close));
  const style: TerminalStyle = {
    level,
    glyphs: glyphsFor(unicode),
    bold: paint("1", "22"),
    dim: paint("2", "22"),
    brand: level === 0 ? PLAIN : paint(BRAND[level]),
    red: paint("31"),
    green: paint("32"),
    yellow: paint("33"),
    cyan: paint("36"),
    magenta: paint("35"),
  };
  cache.set(key, style);
  return style;
}
