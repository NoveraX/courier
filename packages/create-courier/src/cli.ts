#!/usr/bin/env node

import { createLogger } from "@noverax/courier";
import { formatHelp, helpOptions, styleFor } from "@noverax/courier/internal";
import { type ArgsDef, defineCommand, runMain } from "citty";

import { createCourier } from "./create";
import { createCourierVersion } from "./create-courier-version";
import { FRAMEWORKS } from "./frameworks";

const log = createLogger("Create");

const SUMMARY =
  "Set Courier up in one command: your typed API, the route the browser calls it through, Studio and mock data";

const ARGS = {
  dir: {
    type: "positional",
    required: false,
    valueHint: "dir",
    description: "The project's folder, or a new one to create (default: the working directory)",
  },
  framework: {
    type: "string",
    valueHint: "name",
    description: `${FRAMEWORKS.map((framework) => framework.id).join(", ")} (default: found in package.json)`,
  },
  openapi: {
    type: "string",
    valueHint: "spec",
    description:
      "Import your API from an OpenAPI, Swagger or Postman specification, a URL or a file, in place of the example",
  },
  name: {
    type: "string",
    valueHint: "name",
    description: "The imported API's name (default: from the specification)",
  },
  studio: {
    type: "boolean",
    default: true,
    description: "Set Courier Studio up; --no-studio to leave it out",
  },
  mocks: {
    type: "boolean",
    default: true,
    description: "Run the example API's mock with Studio; --no-mocks to leave it out",
  },
  mcp: {
    type: "boolean",
    description: "Offer the API's reads to AI agents in your editor, over MCP",
  },
  "package-manager": {
    type: "string",
    valueHint: "npm|pnpm|yarn|bun",
    description: "Install with this one (default: the project's)",
  },
  install: {
    type: "boolean",
    default: true,
    description: "Install the packages; --no-install to only write the files",
  },
  yes: { type: "boolean", alias: "y", description: "Set Courier up without asking (-y)" },
  "dry-run": { type: "boolean", description: "Show the plan, and change nothing" },
} as const satisfies ArgsDef;

async function printHelp(): Promise<void> {
  const help = {
    product: "Create Courier",
    version: createCourierVersion(),
    summary: SUMMARY,
    command: "create-courier [dir]",
    options: helpOptions(ARGS),
  };
  console.log(formatHelp(help, styleFor(process.stdout)));
}

const main = defineCommand({
  meta: { name: "create-courier", version: createCourierVersion(), description: SUMMARY },
  args: ARGS,
  async run({ args }) {
    const style = styleFor(process.stdout);
    const terminal = {
      interactive: process.stdin.isTTY === true && process.stderr.isTTY === true,
      style,
      print: (lines: readonly string[]) => process.stdout.write(`${lines.join("\n")}\n`),
    };
    try {
      process.exitCode = await createCourier(args, terminal);
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  },
});

runMain(main, { showUsage: printHelp });
