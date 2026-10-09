import { basename, dirname } from "node:path";

import { addCourier, type Terminal } from "../add-courier";
import { runTool } from "../apply/run-tool";
import type { CreateRun } from "../create-run";
import { FRAMEWORKS, type Framework, frameworkById } from "../frameworks";
import {
  invokingManager,
  type PackageManagerName,
  packageManager,
} from "../project/package-manager";
import { askChoice, askYesNo } from "../prompt";
import { generatorFor } from "./generators";
import { prepareTemplate } from "./prepare-template";

/* Remix continues as React Router's framework mode, which its new projects are made with. */
const CREATABLE = FRAMEWORKS.filter((framework) => framework.id !== "remix");

async function frameworkToCreate(run: CreateRun, terminal: Terminal): Promise<Framework> {
  if (run.framework !== undefined) return frameworkById(run.framework);
  if (!terminal.interactive) {
    throw new Error(
      `Name the framework to create the project with: --framework ${CREATABLE.map((framework) => framework.id).join("|")}`,
    );
  }
  const at = await askChoice(
    "Create it with which framework?",
    CREATABLE.map((framework) => framework.label),
  );
  return CREATABLE[at] ?? CREATABLE[0] ?? frameworkById("next");
}

function managerName(run: CreateRun): PackageManagerName {
  const asked = run["package-manager"];
  if (asked === undefined) return invokingManager() ?? "npm";
  if (asked === "npm" || asked === "pnpm" || asked === "yarn" || asked === "bun") return asked;
  throw new Error(`--package-manager takes npm, pnpm, yarn or bun, not "${asked}"`);
}

/* The folder's name, which becomes the package's: what npm takes for one. */
function packageNameOf(root: string): string {
  const name = basename(root);
  if (/^[a-z0-9][a-z0-9._-]*$/.test(name)) return name;
  throw new Error(
    `"${name}" cannot name a package: name the new folder in lowercase letters, digits, ".", "_" and "-"`,
  );
}

async function agreed(run: CreateRun, terminal: Terminal): Promise<boolean> {
  if (run.yes === true) return true;
  if (terminal.interactive) return askYesNo("Create it, and set Courier up in it?", true);
  terminal.print([
    "Nothing was created: run it again with --yes to create it, or --dry-run to only show the plan.",
  ]);
  return false;
}

/**
 * Create a new project in a folder with nothing in it yet — with the
 * framework's own generator, run without a question at the major the setup
 * is checked against, or, for Express, a minimal server of the command's
 * own — put right what the template gets wrong, install its packages with
 * the person's package manager, and set Courier up in it.
 *
 * @param root - The new project's folder
 * @param run - What the command line asked for
 * @param terminal - Where to write, and whether to ask
 * @returns The exit status
 * @example
 * ```ts
 * process.exitCode = await createProject("/work/shop", { framework: "next", yes: true }, terminal);
 * ```
 */
export async function createProject(
  root: string,
  run: CreateRun,
  terminal: Terminal,
): Promise<number> {
  const name = packageNameOf(root);
  const framework = await frameworkToCreate(run, terminal);
  const manager = packageManager(managerName(run));
  const generator = generatorFor(framework.id, name, manager.name);
  const how = generator
    ? `npx --yes ${generator.args.join(" ")}`
    : "an Express server in TypeScript, the command's own";
  terminal.print([
    terminal.style.bold(`Create ${name} with ${framework.label}, then set Courier up in it`),
    "",
    `  ${how}`,
    "",
  ]);
  if (run["dry-run"] === true || !(await agreed(run, terminal)))
    return run["dry-run"] === true ? 0 : 1;
  if (generator) {
    const { status } = await runTool(
      ["npx", "--yes", ...generator.args],
      dirname(root),
      false,
      "ignore",
    );
    if (status !== 0)
      throw new Error(
        `${framework.label}'s generator failed (exit ${status}); nothing of Courier's was added`,
      );
  }
  await prepareTemplate({ root, name, framework: framework.id, manager, generator }, terminal);
  terminal.print([""]);
  return addCourier(
    root,
    { ...run, framework: framework.id, "package-manager": manager.name, yes: true, fresh: true },
    terminal,
  );
}
