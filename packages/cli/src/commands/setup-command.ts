import { resolve } from "node:path";
import { runSetupCommand, setUpRoutes } from "@noverax/create-courier/setup";
import { type ArgsDef, defineCommand } from "citty";

import { cliVersion } from "../cli-version";

/** The `setup` command's options. */
export const SETUP_ARGS = {
  cwd: {
    type: "string",
    valueHint: "dir",
    description: "Project root directory (default: current working directory)",
  },
  framework: {
    type: "string",
    valueHint: "name",
    description:
      "next, nuxt, sveltekit, astro, react-router, remix or solid-start (default: found in package.json)",
  },
  "package-manager": {
    type: "string",
    valueHint: "npm|pnpm|yarn|bun",
    description: "Install with this one (default: the project's)",
  },
  install: {
    type: "boolean",
    default: true,
    description: "Install Courier's plugin; --no-install to only make the changes",
  },
  yes: { type: "boolean", alias: "y", description: "Make the changes without asking (-y)" },
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

/**
 * `courier-cli setup` — move a project Courier is set up in to the routes
 * Courier's plugin for its build gives the pages: the plugin in the
 * build's config, each module that takes courier.routes.ts moved to
 * `@noverax/courier/routes` with the config registered there, Studio kept
 * from writing the module again, and the plugin installed. The changes are
 * create-courier's own, so a project set up either way ends the same.
 *
 * @example
 * ```sh
 * courier-cli setup --dry-run
 * ```
 */
export const setupCommand = defineCommand({
  meta: { name: "setup", description: "Build the pages' routes in with Courier's plugin" },
  args: SETUP_ARGS,
  async run({ args }) {
    const root = resolve(args.cwd ?? process.cwd());
    const command = {
      command: "courier-cli setup",
      version: cliVersion(),
      logScope: "Setup",
      json: args.json === true,
    };
    process.exitCode = await runSetupCommand(command, (io) => setUpRoutes(root, args, io));
  },
});
