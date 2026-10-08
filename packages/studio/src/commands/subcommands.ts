import { formatHelp, helpOptions, styleFor } from "@noverax/courier/internal";
import { runMain } from "citty";

import { studioVersion } from "../server/studio-version";
import { MCP_ARGS, mcpCommand } from "./mcp-command";
import { OPENAPI_ARGS, openapiCommand } from "./openapi-command";
import { VERIFY_ARGS, verifyCommand } from "./verify-command";

/** A command of its own beside the server: its name, what it does, and how it runs. */
interface Subcommand {
  name: string;
  /** One line, for `courier-studio --help` */
  description: string;
  /** A sentence, for its own `--help` */
  summary: string;
  args: Parameters<typeof helpOptions>[0];
  /** Run it on the arguments after its name, with its help for a usage error */
  run(rawArgs: string[], showUsage: () => Promise<void>): void;
}

/** The commands `courier-studio` runs instead of the server, in the order its help lists them. */
export const SUBCOMMANDS: readonly Subcommand[] = [
  {
    name: "openapi",
    description: "Write the project's sources as OpenAPI documents",
    summary:
      "Write the project's sources, as courier.config.ts declares them, as OpenAPI documents",
    args: OPENAPI_ARGS,
    run: (rawArgs, showUsage) => void runMain(openapiCommand, { rawArgs, showUsage }),
  },
  {
    name: "mcp",
    description: "Serve the running Studio to an editor's agent over stdio",
    summary:
      "Serve the running Studio to an editor's agent over stdio: its recorded requests, its mocks and their scenarios",
    args: MCP_ARGS,
    run: (rawArgs, showUsage) => void runMain(mcpCommand, { rawArgs, showUsage }),
  },
  {
    name: "verify",
    description: "Check recorded calls against the API definition",
    summary:
      "Check recorded calls — the HAR files named, or those in tests/recorded — against the API definition as courier.config.ts declares it now, and fail when one no longer fits",
    args: VERIFY_ARGS,
    run: (rawArgs, showUsage) => void runMain(verifyCommand, { rawArgs, showUsage }),
  },
];

/**
 * Run the command named first on the command line, if it is one of
 * `courier-studio`'s own: each is its own program, which starts no server.
 *
 * @param argv - The process's arguments, `process.argv`
 * @returns Whether a command ran
 * @example
 * ```ts
 * if (!runSubcommand(process.argv)) void runMain(main);
 * ```
 */
export function runSubcommand(argv: readonly string[]): boolean {
  const named = SUBCOMMANDS.find((subcommand) => subcommand.name === argv[2]);
  if (!named) return false;
  named.run(argv.slice(3), () => printHelpOf(named));
  return true;
}

/* Help in Courier's own layout and colours, which follow the terminal, as every line Studio prints does. */
async function printHelpOf(subcommand: Subcommand): Promise<void> {
  const help = {
    product: "Courier Studio",
    version: studioVersion(),
    summary: subcommand.summary,
    command: `courier-studio ${subcommand.name}`,
    options: helpOptions(subcommand.args),
  };
  console.log(formatHelp(help, styleFor(process.stdout)));
}
