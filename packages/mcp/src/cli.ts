#!/usr/bin/env node

import { resolve } from "node:path";
import { createLogger } from "@noverax/courier";
import { formatHelp, helpOptions, styleFor } from "@noverax/courier/internal";
import { type ArgsDef, defineCommand, runMain } from "citty";

import { listProject } from "./list-project";
import { formatToolList } from "./listing/format-tool-list";
import { mcpVersion } from "./mcp-version";
import { serveProject } from "./serve-project";
import { guardStdout } from "./transport/guard-stdout";

const log = createLogger("MCP");

const SUMMARY =
  "Your API as tools for AI agents over stdio: the endpoints marked .agent(), and those courier.config's agents offers";

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
  "read-only": {
    type: "boolean",
    description: "Offer reads alone, whatever courier.config's agents allows",
  },
  deny: {
    type: "string",
    valueHint: "patterns",
    description: "Comma-separated endpoints to keep from agents as well: billing.**,shop.users.*",
  },
  list: {
    type: "boolean",
    description: "Print what is offered to agents and why, and exit without serving",
  },
  watch: {
    type: "boolean",
    default: true,
    description:
      "Load courier.config again on a save and tell the client when the tools change (--no-watch turns it off)",
  },
  "allow-destructive": {
    type: "boolean",
    description:
      "Leave a call a person confirms to the client's own approval when the client cannot ask a person",
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
    /* Taken before the config loads: what it prints goes to stderr, not the protocol or the listing. */
    const write = guardStdout();
    const timeoutMs = args.timeout === undefined ? 60_000 : Number(args.timeout);
    try {
      if (args._.length > 0)
        throw new Error(`Unknown command "${args._[0]}". Run courier-mcp --help.`);
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0)
        throw new Error(`--timeout takes milliseconds, not ${args.timeout}`);
      const project = {
        root: resolve(args.cwd ?? process.cwd()),
        only: list(args.source),
        envFiles: list(args.dotenv),
        narrowing: { readOnly: args["read-only"] === true, deny: list(args.deny) },
      };
      if (args.list === true) {
        write(formatToolList(await listProject(project), styleFor(process.stdout)).trimEnd());
        process.exit(0);
      }
      await serveProject({
        ...project,
        allowDestructive: args["allow-destructive"] === true,
        watch: args.watch !== false,
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
