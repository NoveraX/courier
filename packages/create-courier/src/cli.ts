#!/usr/bin/env node

import { formatHelp, helpOptions, styleFor } from "@noverax/courier/internal";
import { type ArgsDef, defineCommand, runMain } from "citty";

import { createCourier } from "./create";
import { createCourierVersion } from "./create-courier-version";
import { FRAMEWORKS } from "./frameworks";
import { nodeTooOld } from "./preflight/node-version";
import { runSetupCommand } from "./run-setup-command";

const SUMMARY =
  "Set Courier up in one command, in your project or a new one: your typed API, the route the browser calls it through, Studio and mock data";

const EXAMPLES = [
  { command: "create-courier", description: "Set Courier up in the project in this folder" },
  {
    command: "create-courier shop",
    description: "Create shop with the framework you pick, then set Courier up in it",
  },
  {
    command: "create-courier --openapi ./openapi.json",
    description: "Set Courier up with your API in place of the example",
  },
  {
    command: "create-courier --yes --mcp",
    description: "Go ahead without asking, and offer the API's reads to agents over MCP",
  },
] as const;

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
  example: {
    type: "boolean",
    description:
      "Add an example API with a page that calls it; --no-example to set Courier up with no API yet",
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
    description: "Set Courier Studio up; --no-studio to leave it out",
  },
  mocks: {
    type: "boolean",
    description: "Run the example API's mock with Studio; --no-mocks to leave it out",
  },
  mcp: {
    type: "boolean",
    description: "Offer the API's reads to AI agents in your editor, over MCP",
  },
  routes: {
    type: "string",
    valueHint: "plugin|file",
    description:
      "Give pages their routes from Courier's plugin for the app's build, or from courier.routes.ts (default: plugin; file where the project keeps one)",
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
  "allow-dirty": {
    type: "boolean",
    description: "Go ahead with --yes where git has changes not committed",
  },
  "dry-run": { type: "boolean", description: "Show the plan, and change nothing" },
  json: {
    type: "boolean",
    description:
      "Report the plan and what was done as one JSON document on standard output, asking nothing",
  },
} as const satisfies ArgsDef;

async function printHelp(): Promise<void> {
  const help = {
    product: "Create Courier",
    version: createCourierVersion(),
    summary: SUMMARY,
    command: "create-courier [dir]",
    arguments: [{ flags: "[dir]", description: ARGS.dir.description }],
    options: helpOptions(ARGS),
    examples: EXAMPLES,
  };
  console.log(formatHelp(help, styleFor(process.stdout)));
}

const main = defineCommand({
  meta: { name: "create-courier", version: createCourierVersion(), description: SUMMARY },
  args: ARGS,
  async run({ args }) {
    const command = {
      command: "create-courier",
      version: createCourierVersion(),
      logScope: "Create",
      json: args.json === true,
      cannotRun: () => {
        const old = nodeTooOld();
        return old === undefined
          ? undefined
          : `${old}. Install a newer Node.js from https://nodejs.org, and run it again`;
      },
    };
    process.exitCode = await runSetupCommand(command, (io) => createCourier(args, io));
  },
});

runMain(main, { showUsage: printHelp });
