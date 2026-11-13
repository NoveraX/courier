import { runSetupCommand } from "@noverax/create-courier/engine";
import { type ArgsDef, defineCommand } from "citty";

import { cliVersion } from "../cli-version";
import { runUpgrade } from "../upgrade/run-upgrade";

/** The `upgrade` command's options. */
export const UPGRADE_ARGS = {
  cwd: {
    type: "string",
    valueHint: "dir",
    description: "The project, or a package of its workspace (default: the working directory)",
  },
  to: {
    type: "string",
    valueHint: "version",
    description: "The release to move to (default: the registry's latest)",
  },
  "package-manager": {
    type: "string",
    valueHint: "npm|pnpm|yarn|bun",
    description: "Install with this one (default: the project's)",
  },
  install: {
    type: "boolean",
    default: true,
    description: "Install the new release; --no-install to only make the changes",
  },
  yes: { type: "boolean", alias: "y", description: "Upgrade without asking (-y)" },
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
 * `courier-cli upgrade` — move a project to a new release of Courier:
 * every one of Courier's packages in its workspace raised at once, and
 * one install at the workspace's root, undone with the changes when it
 * fails.
 *
 * @example
 * ```sh
 * npx @noverax/courier-cli@latest upgrade --dry-run
 * ```
 */
export const upgradeCommand = defineCommand({
  meta: { name: "upgrade", description: "Move the project to a new release of Courier" },
  args: UPGRADE_ARGS,
  async run({ args }) {
    const command = {
      command: "courier-cli upgrade",
      version: cliVersion(),
      logScope: "Upgrade",
      json: args.json === true,
    };
    process.exitCode = await runSetupCommand(command, (io) => runUpgrade(args, io));
  },
});
