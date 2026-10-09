import type { Terminal } from "../add-courier";
import { install } from "../apply/install";
import { runTool } from "../apply/run-tool";
import type { FrameworkId } from "../frameworks";
import type { PackageManager } from "../project/package-manager";
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
 * @param terminal - Where to say what was put right and added
 * @throws {Error} When an install or a step fails, naming it
 * @example
 * ```ts
 * await prepareTemplate({ root, name: "shop", framework: "astro", manager, generator }, terminal);
 * ```
 */
export async function prepareTemplate(template: NewTemplate, terminal: Terminal): Promise<void> {
  const { root, name, framework, manager, generator } = template;
  const express = generator ? undefined : writeExpressTemplate(root, name);
  const fixed = fixFreshProject(root, framework, manager.name);
  if (fixed.length > 0) terminal.print(["", ...fixed]);
  if (express) {
    await install(root, [
      manager.add(express.dependencies, false),
      manager.add(express.devDependencies, true),
    ]);
  } else if (generator?.install) await install(root, [manager.install()]);
  for (const step of generator?.afterInstall ?? []) {
    const command = manager.exec(step.bin, step.args);
    const { status } = await runTool(command, root, false, "ignore");
    if (status !== 0)
      throw new Error(
        `${command.join(" ")} failed (exit ${status}); nothing of Courier's was added`,
      );
    terminal.print(["", step.done]);
  }
}
