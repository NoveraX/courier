import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  changedByEdits,
  gitState,
  goAhead,
  managerFor,
  type NextStep,
  type PackageManager,
  type Plan,
  type SetupIO,
  SetupRefusal,
  transact,
  typecheckTouched,
} from "@noverax/create-courier/engine";

import { isRecord } from "../util/is-record";
import { manifestEdits } from "./manifest-edits";
import { courierPackages } from "./project-packages";
import { managerRegistry, type Registry } from "./registry";
import { releasesBetween } from "./releases";
import { upgradeVersions } from "./upgrade-versions";
import { formatVersion } from "./versions";
import { workspaceOf } from "./workspace";

/** Where an upgrade reaches the world outside the project: the registry, and the package manager that installs. */
export interface UpgradeReach {
  readonly registry: (root: string, manager: PackageManager) => Registry;
  /** The package manager, where the command line names none: the project's. */
  readonly manager: (root: string, named: string | undefined) => PackageManager;
}

const REACH: UpgradeReach = { registry: managerRegistry, manager: managerFor };

/** What the command line asked of an upgrade. */
export interface UpgradeRun {
  readonly cwd?: string | undefined;
  readonly to?: string | undefined;
  readonly from?: string | undefined;
  readonly "package-manager"?: string | undefined;
  /** `false` to write the changes and name the install command. */
  readonly install?: boolean | undefined;
  readonly yes?: boolean | undefined;
  readonly "allow-dirty"?: boolean | undefined;
  readonly "dry-run"?: boolean | undefined;
}

const WORDS = {
  question: "Upgrade?",
  unasked:
    "Nothing was changed: run it again with --yes to upgrade, or --dry-run to only show the plan.",
  declined: "Nothing was changed.",
};

function nameOf(root: string): string {
  const path = join(root, "package.json");
  const parsed: unknown = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
  return isRecord(parsed) && typeof parsed.name === "string" ? parsed.name : basename(root);
}

/* What to run once the upgrade holds: the whole project's type check, which shows what is left to the person. */
function nextSteps(manager: PackageManager): NextStep[] {
  return [
    {
      command: manager.exec("tsc", ["--noEmit"]).join(" "),
      what: "checks the whole project against the new release's types",
    },
  ];
}

/**
 * Upgrade Courier in a project: find its workspace and every one of
 * Courier's packages its manifests list, the release it is on and the one
 * to move to, and show the plan — each package's range raised, the
 * breaking changes of each release it crosses — then, once the person
 * agrees or with `--yes`, write the ranges and install them with one
 * command at the workspace's root, undone together when the install
 * fails; then check the types of what changed.
 *
 * @param run - What the command line asked for
 * @param io - Where to tell what it does, and whether to ask
 * @param own - The command's own version: it knows the changes up to its release
 * @param reach - The registry and the package manager: the person's own, unless a test gives others
 * @returns The exit status
 * @throws {SetupRefusal} Naming why the upgrade cannot be made, before anything is changed
 * @example
 * ```ts
 * process.exitCode = await runUpgrade({ yes: true }, io, cliVersion());
 * ```
 */
export async function runUpgrade(
  run: UpgradeRun,
  io: SetupIO,
  own: string,
  reach: UpgradeReach = REACH,
): Promise<number> {
  const workspace = workspaceOf(run.cwd ?? process.cwd());
  const { root } = workspace;
  const packages = courierPackages(workspace);
  if (packages.length === 0)
    throw new SetupRefusal(
      "NO_COURIER",
      `No package of Courier's is listed in ${root}: set Courier up with npx @noverax/create-courier`,
    );
  const manager = reach.manager(root, run["package-manager"]);
  const { from, to } = await upgradeVersions(run, reach.registry(root, manager), packages, own);
  const target = formatVersion(to);
  const manifests = manifestEdits(root, packages, to);
  const notes = releasesBetween(from, to).flatMap((release) =>
    release.notes.map((note) => ({ release: release.version, ...note })),
  );
  const plan: Plan = {
    files: [],
    edits: manifests.edits,
    dependencies: [],
    devDependencies: [],
    otherReleases: [],
    notInstalled: [],
    typescript: undefined,
    manual: [],
    next: nextSteps(manager),
    prepare: [],
  };
  const git = await gitState(root);
  const upgrade = { from: formatVersion(from), to: target, packages: manifests.packages, notes };
  const title = `Upgrade Courier in ${nameOf(root)} to ${target} (${manager.name})`;
  io.report.plan({ title, plan, git, upgrade });
  if (plan.edits.length === 0) {
    io.report.end({ kind: "unchanged", said: `Courier is at ${target} already.`, next: [] });
    return 0;
  }
  if (run["dry-run"] === true) {
    io.report.end({ kind: "dry-run" });
    return 0;
  }
  if (!(await goAhead(run, io, WORDS, git))) return 1;
  const installing = run.install !== false;
  const commands = [manager.install()];
  const install = installing ? ({ when: "after", commands } as const) : undefined;
  const done = await transact({ root, manager, plan, install }, io);
  if (typeof done === "number") return done;
  if (!installing) {
    io.report.end({ kind: "install-left", plan, commands });
    return 0;
  }
  const outcome = await typecheckTouched(root, { added: [], changed: changedByEdits(plan.edits) });
  io.report.typechecked(outcome);
  if (outcome.kind === "errors") {
    io.report.end({ kind: "typecheck-failed" });
    return 1;
  }
  io.report.end({ kind: "applied", plan, said: `Courier is upgraded to ${target}.` });
  return 0;
}
