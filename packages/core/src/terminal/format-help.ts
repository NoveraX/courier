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
  /** What it takes by position, each with what it is: `[dir]`. */
  readonly arguments?: readonly HelpOption[] | undefined;
  readonly options: readonly HelpOption[];
  /** The commands it takes besides its own work, each with what it does. */
  readonly commands?: readonly HelpCommand[] | undefined;
  /** Command lines as a user would type them, each with what it does. */
  readonly examples?: readonly HelpExample[] | undefined;
}

/** A command line a CLI's `--help` shows as an example. */
export interface HelpExample {
  /** As a user types it: `create-courier shop`. */
  readonly command: string;
  readonly description: string;
}

/** A command a CLI takes, as its `--help` lists it. */
export interface HelpCommand {
  /** What a user types after the CLI's name: `openapi`. */
  readonly name: string;
  readonly description: string;
}

/* A flag in the accent colour; the value it takes, `<port>`, dimmed. A value
   holds no `<`, so a run of them is passed over in linear time. */
const FLAG_PARTS = /(<[^<>]+>)|([^\s,<]+)/g;

function styleFlags(flags: string, { cyan, dim }: TerminalStyle): string {
  return flags.replace(FLAG_PARTS, (part, value?: string) => (value ? dim(part) : cyan(part)));
}

/* A section under its heading, after a blank line; nothing when it is empty. */
function section(title: string, lines: readonly string[], { bold }: TerminalStyle): string[] {
  return lines.length === 0 ? [] : ["", `  ${bold(title)}`, ...lines];
}

/**
 * A command's help: its title, what it is, how to run it, the arguments and
 * options it takes in one column, and examples of it.
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
  const args = help.arguments ?? [];
  const width = Math.max(...[...args, ...help.options].map((option) => option.flags.length)) + 4;
  const column = (entries: readonly HelpOption[]) =>
    entries.map(
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
    ...commandLines(help, style),
    ...section("Arguments", column(args), style),
    ...section("Options", column(help.options), style),
    ...exampleLines(help, style),
    "",
  ].join("\n");
}

/* The examples, each command beside what it does. */
function exampleLines(help: Help, style: TerminalStyle): string[] {
  const examples = help.examples ?? [];
  const width = Math.max(0, ...examples.map(({ command }) => command.length)) + 4;
  return section(
    "Examples",
    examples.map(
      ({ command, description }) =>
        `    ${style.cyan(command)}${" ".repeat(width - command.length)}${description}`,
    ),
    style,
  );
}

/* The commands under the usage line, each named as it is typed. */
function commandLines(help: Help, { bold, cyan, dim }: TerminalStyle): string[] {
  const commands = help.commands ?? [];
  if (commands.length === 0) return [];
  const width = Math.max(...commands.map(({ name }) => name.length)) + 4;
  return [
    `    ${help.command} ${dim("<command> [options]")}`,
    "",
    `  ${bold("Commands")}`,
    ...commands.map(
      ({ name, description }) =>
        `    ${cyan(name)}${" ".repeat(width - name.length)}${description}`,
    ),
  ];
}
