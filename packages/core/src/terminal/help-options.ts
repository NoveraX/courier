import type { HelpOption } from "./format-help";

/** An option as a command declares it for its argument parser. */
export interface DeclaredOption {
  readonly type: string;
  readonly description?: string | undefined;
  /** What the value is called in the help: `--config <file>`. */
  readonly valueHint?: string | undefined;
}

/* The two flags every command answers, ahead of its own options. */
const BUILT_IN: readonly HelpOption[] = [
  { flags: "-h, --help", description: "Show this help" },
  { flags: "-v, --version", description: "Show the version" },
];

/**
 * The help's list of options for a command's declared ones, followed by
 * `--help` and `--version`. A flag that takes a value names it after its
 * `valueHint`, else after itself; a positional argument is left out.
 *
 * @param declared - The options, by name, as the command declares them
 * @returns Each option's flags and description, in order
 * @example
 * ```ts
 * helpOptions({ port: { type: "string", description: "Server port", valueHint: "port" } });
 * // [{ flags: "--port <port>", description: "Server port" }, …help, …version]
 * ```
 */
export function helpOptions(declared: Readonly<Record<string, DeclaredOption>>): HelpOption[] {
  const own = Object.entries(declared)
    .filter(([, option]) => option.type !== "positional")
    .map(([name, option]) => ({
      flags: option.type === "boolean" ? `--${name}` : `--${name} <${option.valueHint ?? name}>`,
      description: option.description ?? "",
    }));
  return [...own, ...BUILT_IN];
}
