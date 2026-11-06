#!/usr/bin/env node

import { createLogger } from "@noverax/courier";
import { formatHelp, helpOptions, styleFor } from "@noverax/courier/internal";
import { serveStdio } from "@noverax/courier-mcp/internal";

import { packageVersion } from "./package-version";
import { docsServer } from "./server";

const log = createLogger("Docs");

const SUMMARY =
  "Courier's documentation for the version a project installs, served to the agent in an editor with no network";

/* Help in Courier's own layout and colours, which follow the terminal, as Courier's other commands do. */
function printHelp(): void {
  const help = {
    product: "Courier Docs",
    version: packageVersion(),
    summary: SUMMARY,
    command: "courier-docs <command>",
    options: helpOptions({}),
    commands: [
      {
        name: "mcp",
        description: "Serve the docs over stdio: search them, read a page, list them",
      },
    ],
    examples: [
      { command: "npx @noverax/courier-docs mcp", description: "What an editor's MCP config runs" },
    ],
  };
  console.log(formatHelp(help, styleFor(process.stdout)));
}

/* The docs over stdio until the client closes its end. The server runs none of the project's code
   and logs only its errors, which go to stderr, so stdout carries the protocol alone. */
async function serve(): Promise<void> {
  try {
    await serveStdio(docsServer(), {
      input: process.stdin,
      write: (line) => process.stdout.write(`${line}\n`),
    });
  } catch (error) {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const [name, ...rest] = process.argv.slice(2);
const asksHelp = (args: readonly string[]) => args.includes("-h") || args.includes("--help");
if (name === "mcp" && rest.length === 0) {
  void serve();
} else if (name === undefined || asksHelp([name, ...rest])) {
  printHelp();
} else if (name === "-v" || name === "--version") {
  console.log(packageVersion());
} else if (name === "mcp") {
  log.error(`courier-docs mcp takes no options, not ${rest.join(" ")}. Run courier-docs --help.`);
  process.exitCode = 1;
} else {
  log.error(`Unknown command "${name}". Run courier-docs --help.`);
  process.exitCode = 1;
}
