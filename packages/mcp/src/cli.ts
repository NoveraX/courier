#!/usr/bin/env node

import { resolve } from "node:path";
import { createLogger } from "@noverax/courier";
import { formatHelp, helpOptions, styleFor } from "@noverax/courier/internal";
import { type ArgsDef, defineCommand, runMain } from "citty";

import { mcpVersion } from "./mcp-version";
import { serveProject } from "./serve-project";
import { guardStdout } from "./transport/guard-stdout";

const log = createLogger("MCP");

const SUMMARY = "Your API's endpoints marked .agent(), as tools for AI agents over stdio";

const ARGS = {
  cwd: {
    type: "string",
    valueHint: "dir",
    description: "Project root, where courier.config.* is (default: the working directory)",
  },
  source: {
    type: "string",
    valueHint: "names",
    description: "Comma-separated sources to offer (default: every source)",
  },
  /* Not `--env-file`: Node takes that one for itself wherever it appears, after the script too. */
  dotenv: {
    type: "string",
    valueHint: "files",
    description: "Comma-separated .env files to load first, such as .env.local",
  },
  "allow-destructive": {
    type: "boolean",
    description: "Run destructive tools without asking a person when the client cannot ask one",
  },
  timeout: {
    type: "string",
    valueHint: "ms",
    description: "How long a call may take when its endpoint names no timeout (default: 60000)",
  },
  name: {
    type: "string",
    valueHint: "name",
    description: "The name the server gives its client (default: courier)",
  },
} as const satisfies ArgsDef;

function list(value: string | undefined): string[] | undefined {
  const names = value
    ?.split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  return names === undefined || names.length === 0 ? undefined : names;
}

/* citty's own help colours a pipe; this one follows the terminal, as Courier's other commands do. */
async function printHelp(): Promise<void> {
  const help = {
    product: "Courier MCP",
    version: mcpVersion(),
    summary: SUMMARY,
    command: "courier-mcp",
    options: helpOptions(ARGS),
  };
  console.log(formatHelp(help, styleFor(process.stdout)));
}

const main = defineCommand({
  meta: { name: "courier-mcp", version: mcpVersion(), description: SUMMARY },
  args: ARGS,
  async run({ args }) {
    const write = guardStdout();
    const timeoutMs = args.timeout === undefined ? 60_000 : Number(args.timeout);
    try {
      if (args._.length > 0)
        throw new Error(`Unknown command "${args._[0]}". Run courier-mcp --help.`);
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0)
        throw new Error(`--timeout takes milliseconds, not ${args.timeout}`);
      await serveProject({
        root: resolve(args.cwd ?? process.cwd()),
        only: list(args.source),
        envFiles: list(args.dotenv),
        allowDestructive: args["allow-destructive"] === true,
        timeoutMs,
        info: { name: args.name ?? "courier", version: mcpVersion() },
        input: process.stdin,
        write,
      });
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
    /* The client closed stdin: the protocol's signal to stop, whatever the config left open. */
    process.exit(0);
  },
});

runMain(main, { showUsage: printHelp });
