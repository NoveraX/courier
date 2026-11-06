import { basename, dirname } from "node:path";

import { addCourier } from "../add-courier";
import { runTool, toolFailure } from "../apply/run-tool";
import { SetupFailure } from "../apply/setup-failure";
import type { CreateRun } from "../create-run";
import { FRAMEWORKS, type Framework, frameworkById } from "../frameworks";
import { SETUP_LIMITS } from "../limits";
import { goAhead } from "../preflight/go-ahead";
import {
  invokingManager,
  type PackageManagerName,
  packageManager,
} from "../project/package-manager";
import { setupChoices } from "../questions/setup-choices";
import { isRoutesFramework } from "../recipes/edits/framework-routes";
import type { SetupIO } from "../setup-io";
import { generatorFor } from "./generators";
import { prepareTemplate } from "./prepare-template";

/* Remix continues as React Router's framework mode, which its new projects are made with. */
const CREATABLE = FRAMEWORKS.filter((framework) => framework.id !== "remix");

async function frameworkToCreate(run: CreateRun, io: SetupIO): Promise<Framework> {
  if (run.framework !== undefined) return frameworkById(run.framework);
  if (io.questions === undefined) {
    throw new Error(
      `Name the framework to create the project with: --framework ${CREATABLE.map((framework) => framework.id).join("|")}`,
    );
  }
  const id = await io.questions.select(
    "Create it with which framework?",
    CREATABLE.map((framework) => ({ value: framework.id, label: framework.label })),
    CREATABLE[0]?.id ?? "next",
  );
  return frameworkById(id);
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

const CREATE_WORDS = {
  question: "Create it, and set Courier up in it?",
  unasked:
    "Nothing was created: run it again with --yes to create it, or --dry-run to only show the plan.",
  declined: "Nothing was created.",
};

/**
 * Create a new project in a folder with nothing in it yet — with the
 * framework's own generator, run without a question at the major the setup
 * is checked against, or, for Express, a minimal server of the command's
 * own — put right what the template gets wrong, install its packages with
 * the person's package manager, and set Courier up in it. Every question
 * is asked before anything is made.
 *
 * @param root - The new project's folder
 * @param run - What the command line asked for
 * @param io - Where to tell what it does, and whether to ask
 * @returns The exit status
 * @example
 * ```ts
 * process.exitCode = await createProject("/work/shop", { framework: "next", yes: true }, io);
 * ```
 */
export async function createProject(root: string, run: CreateRun, io: SetupIO): Promise<number> {
  const name = packageNameOf(root);
  const manager = packageManager(managerName(run));
  const framework = await frameworkToCreate(run, io);
  const choices = await setupChoices(run, io, {
    configured: false,
    routes: isRoutesFramework(framework.id),
  });
  const generator = generatorFor(framework.id, name, manager.name);
  const how = generator
    ? `npx --yes ${generator.args.join(" ")}`
    : "an Express server in TypeScript, the command's own";
  io.report.newProject({ name, framework: framework.label, how });
  if (run["dry-run"] === true) {
    io.report.end({ kind: "dry-run" });
    return 0;
  }
  if (!(await goAhead(run, io, CREATE_WORDS))) return 1;
  if (generator) {
    const command = ["npx", "--yes", ...generator.args];
    const result = await runTool(command, {
      cwd: dirname(root),
      output: { kind: "show", on: io.toolOutput },
      input: "ignore",
      deadlineMs: SETUP_LIMITS.generatorMs,
    });
    if (result.status !== 0 || result.stopped !== undefined)
      throw new SetupFailure(
        "GENERATOR_FAILED",
        `${framework.label}'s generator: ${toolFailure(command, result, SETUP_LIMITS.generatorMs)}; nothing of Courier's was added`,
      );
  }
  await prepareTemplate({ root, name, framework: framework.id, manager, generator }, io);
  return addCourier(
    root,
    {
      ...run,
      framework: framework.id,
      "package-manager": manager.name,
      example: choices.example,
      openapi: choices.openapi,
      studio: choices.studio,
      mocks: choices.mocks,
      mcp: choices.mcp,
      routes: choices.routes,
      yes: true,
      fresh: true,
    },
    io,
  );
}
