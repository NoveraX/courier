import { install } from "../apply/install";
import { runTool, toolFailure } from "../apply/run-tool";
import { SetupFailure } from "../apply/setup-failure";
import type { FrameworkId } from "../frameworks";
import { SETUP_LIMITS } from "../limits";
import type { PackageManager } from "../project/package-manager";
import type { SetupIO } from "../setup-io";
import { writeExpressTemplate } from "./express-template";
import { fixFreshProject } from "./fresh-fixes";
import type { Generator } from "./generators";

/** The new project, as its generator left it, or Express's own template is to be written. */
export interface NewTemplate {
  readonly root: string;
  readonly name: string;
  readonly framework: FrameworkId;
  readonly manager: PackageManager;
  readonly generator: Generator | undefined;
}

/**
 * Make a new project ready for Courier: write Express's template where
 * there is no generator, put right what the template gets wrong, install
 * its packages with the person's package manager, and run what it still
 * needs for what Courier adds to it to build — Astro's server adapter.
 *
 * @param template - The new project
 * @param io - Where to say what was put right and added, and where its programs show their output
 * @throws {Error} When an install or a step fails, naming it
 * @example
 * ```ts
 * await prepareTemplate({ root, name: "shop", framework: "astro", manager, generator }, io);
 * ```
 */
export async function prepareTemplate(template: NewTemplate, io: SetupIO): Promise<void> {
  const { root, name, framework, manager, generator } = template;
  const express = generator ? undefined : writeExpressTemplate(root, name);
  const fixed = fixFreshProject(root, framework, manager.name);
  if (fixed.length > 0) io.report.note(fixed);
  if (express) {
    const commands = [
      manager.add(express.dependencies, false),
      manager.add(express.devDependencies, true),
    ];
    await install(root, commands, undefined, io.toolOutput);
  } else if (generator?.install) await install(root, [manager.install()], undefined, io.toolOutput);
  for (const step of generator?.afterInstall ?? []) {
    const command = manager.exec(step.bin, step.args);
    const result = await runTool(command, {
      cwd: root,
      output: { kind: "show", on: io.toolOutput },
      input: "ignore",
      deadlineMs: SETUP_LIMITS.installMs,
    });
    if (result.status !== 0 || result.stopped !== undefined)
      throw new SetupFailure(
        "GENERATOR_FAILED",
        `${toolFailure(command, result, SETUP_LIMITS.installMs)}; nothing of Courier's was added`,
      );
    io.report.note([step.done]);
  }
}
