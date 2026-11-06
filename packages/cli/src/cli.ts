#!/usr/bin/env node

import { createLogger } from "@noverax/courier";
import { formatHelp, helpOptions, styleFor } from "@noverax/courier/internal";
import { runMain } from "citty";

import { cliVersion } from "./cli-version";
import { ROUTES_ARGS, routesCommand } from "./commands/routes-command";
import { SETUP_ARGS, setupCommand } from "./commands/setup-command";
import { UPGRADE_ARGS, upgradeCommand } from "./commands/upgrade-command";

const log = createLogger("CLI");

const SUMMARY =
  "Courier's command line for a project and its CI: what it writes from the project's API definitions, and checks";

/** A command of `courier-cli`: its name, what it does, and how it runs. */
interface Command {
  name: string;
  /** One line, for `courier-cli --help` */
  description: string;
  /** A sentence, for its own `--help` */
  summary: string;
  args: Parameters<typeof helpOptions>[0];
  /** Run it on the arguments after its name, with its help for a usage error */
  run(rawArgs: string[], showUsage: () => Promise<void>): void;
}

const COMMANDS: readonly Command[] = [
  {
    name: "routes",
    description: "Write the routes a page's proxy client takes",
    summary:
      "Write the project's routes module, as Studio writes it while it runs: every endpoint marked .expose(), which a page's proxy client may call, and how the page reaches it — or, with --check, write nothing and fail when it is out of date",
    args: ROUTES_ARGS,
    run: (rawArgs, showUsage) => void runMain(routesCommand, { rawArgs, showUsage }),
  },
  {
    name: "setup",
    description: "Build the pages' routes in with Courier's plugin",
    summary:
      "Move the project to the routes Courier's plugin for its build gives the pages: the plugin in the build's config, each module that takes courier.routes.ts moved to @noverax/courier/routes, with the config registered there, and the plugin installed",
    args: SETUP_ARGS,
    run: (rawArgs, showUsage) => void runMain(setupCommand, { rawArgs, showUsage }),
  },
  {
    name: "upgrade",
    description: "Move the project to a new release of Courier",
    summary:
      "Move the project to a new release of Courier: every one of its packages raised at once in the workspace's manifests, the breaking changes of each release it crosses shown, and one install, undone with the changes when it fails",
    args: UPGRADE_ARGS,
    run: (rawArgs, showUsage) => void runMain(upgradeCommand, { rawArgs, showUsage }),
  },
];

/* Help in Courier's own layout and colours, which follow the terminal, as Courier's other commands do. */
function printHelp(): void {
  const help = {
    product: "Courier CLI",
    version: cliVersion(),
    summary: SUMMARY,
    command: "courier-cli <command>",
    options: helpOptions({}),
    commands: COMMANDS.map(({ name, description }) => ({ name, description })),
    examples: [
      { command: "courier-cli routes", description: "Write courier.routes.ts from the marks" },
      { command: "courier-cli routes --check", description: "Fail when it is out of date, in CI" },
      { command: "courier-cli setup", description: "Move the pages to Courier's routes plugin" },
      {
        command: "npx @noverax/courier-cli@latest upgrade",
        description: "Move the project to Courier's latest release",
      },
    ],
  };
  console.log(formatHelp(help, styleFor(process.stdout)));
}

async function printHelpOf(command: Command): Promise<void> {
  const help = {
    product: "Courier CLI",
    version: cliVersion(),
    summary: command.summary,
    command: `courier-cli ${command.name}`,
    options: helpOptions(command.args),
  };
  console.log(formatHelp(help, styleFor(process.stdout)));
}

const [name, ...rest] = process.argv.slice(2);
const command = COMMANDS.find((each) => each.name === name);
if (command) {
  command.run(rest, () => printHelpOf(command));
} else if (name === undefined || name === "-h" || name === "--help") {
  printHelp();
} else if (name === "-v" || name === "--version") {
  console.log(cliVersion());
} else {
  log.error(`Unknown command "${name}". Run courier-cli --help.`);
  process.exitCode = 1;
}
