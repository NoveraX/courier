import type { TerminalStyle } from "./terminal-style";

/** One option of a command, as its help lists it. */
export interface HelpOption {
  /** The flags and the value they take: `--port <port>`, `-h, --help`. */
  readonly flags: string;
  readonly description: string;
}

/** What a command's `--help` says. */
export interface Help {
  /** The product, as the title reads: `Courier Studio`. */
  readonly product: string;
  readonly version: string;
  /** What the command is, in one sentence. */
  readonly summary: string;
  /** The command a user types: `courier-studio`. */
  readonly command: string;
  readonly options: readonly HelpOption[];
}

/* A flag in the accent colour; the value it takes, `<port>`, dimmed. */
const FLAG_PARTS = /(<[^>]+>)|([^\s,<]+)/g;

function styleFlags(flags: string, { cyan, dim }: TerminalStyle): string {
  return flags.replace(FLAG_PARTS, (part, value?: string) => (value ? dim(part) : cyan(part)));
}

/**
 * A command's help: its title, what it is, how to run it, and its options
 * in a column.
 *
 * @param help - What it says
 * @param style - The style of the stream it is written to
 * @returns The help's lines, with a blank line above and below
 * @example
 * ```ts
 * console.log(formatHelp({ product: "Courier Server", ... }, styleFor(process.stdout)));
 * ```
 */
export function formatHelp(help: Help, style: TerminalStyle): string {
  const { bold, brand, dim } = style;
  const width = Math.max(...help.options.map((option) => option.flags.length)) + 4;
  const options = help.options.map(
    ({ flags, description }) =>
      `    ${styleFlags(flags, style)}${" ".repeat(width - flags.length)}${description}`,
  );
  return [
    "",
    `  ${bold(brand(help.product))} ${dim(`v${help.version}`)}`,
    `  ${help.summary}`,
    "",
    `  ${bold("Usage")}`,
    `    ${help.command} ${dim("[options]")}`,
    "",
    `  ${bold("Options")}`,
    ...options,
    "",
  ].join("\n");
}
