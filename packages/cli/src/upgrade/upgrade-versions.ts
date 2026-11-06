import { SetupRefusal } from "@noverax/create-courier/engine";

import type { CourierPackage } from "./project-packages";
import { publishedAt, type Registry } from "./registry";
import {
  compareVersions,
  formatVersion,
  parseVersion,
  releaseLine,
  type Version,
} from "./versions";

/** What the command line said of the releases. */
export interface VersionsRun {
  readonly to?: string | undefined;
  readonly from?: string | undefined;
}

/* The version a range is written from: ^0.4.0's 0.4.0, ~0.4's 0.4.0. */
function floorOf(range: string): Version | undefined {
  const found = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(range);
  return found === null ? undefined : parseVersion(`${found[1]}.${found[2] ?? 0}.${found[3] ?? 0}`);
}

function lowest(versions: ReadonlyArray<Version | undefined>): Version | undefined {
  const known = versions.filter((version): version is Version => version !== undefined);
  return known.sort(compareVersions)[0];
}

/* The release the project is on: what --from names, else the oldest installed, else the oldest a range is written from. */
function fromOf(run: VersionsRun, packages: readonly CourierPackage[]): Version {
  if (run.from !== undefined) {
    const named = parseVersion(run.from);
    if (named === undefined)
      throw new SetupRefusal("VERSION_INVALID", `--from ${run.from} is no version`);
    return named;
  }
  const from =
    lowest(packages.map((each) => (each.installed ? parseVersion(each.installed) : undefined))) ??
    lowest(packages.map((each) => floorOf(each.range)));
  if (from === undefined)
    throw new SetupRefusal(
      "VERSION_UNKNOWN",
      "Which release the project is on cannot be read: name it with --from",
    );
  return from;
}

/* Why the running Node.js is older than a package at the target asks for: a floor of `>=` alone is read. */
function nodeTooOld(name: string, range: string | undefined): string | undefined {
  const floor =
    range === undefined ? undefined : /^\s*>=\s*v?(\d+(?:\.\d+){0,2})\s*$/.exec(range)?.[1];
  const wants =
    floor === undefined ? undefined : parseVersion(`${floor}.0.0`.split(".").slice(0, 3).join("."));
  const running = parseVersion(process.versions.node);
  if (wants === undefined || running === undefined || compareVersions(running, wants) >= 0)
    return undefined;
  return `${name} at the target needs Node.js ${range}, and this is ${process.versions.node}`;
}

/**
 * The releases an upgrade moves between: the one the project is on — as
 * `--from` names it, else the oldest of Courier's packages installed —
 * and the one it moves to, `--to` or the registry's latest. Refused,
 * before anything is read further: a move back; a release newer than the
 * command, which knows the changes up to its own; a package of the
 * project's that the release does not publish; and a release that needs
 * a newer Node.js than the one running.
 *
 * @param run - What the command line said of the releases
 * @param registry - Where to ask what is published
 * @param packages - Courier's packages the workspace lists
 * @param own - The command's own version
 * @returns The releases
 * @throws {SetupRefusal} Naming why the upgrade cannot be made
 * @example
 * ```ts
 * await upgradeVersions({}, managerRegistry(root, manager), packages, cliVersion()); // { from: 0.4.0, to: 0.5.0 }
 * ```
 */
export async function upgradeVersions(
  run: VersionsRun,
  registry: Registry,
  packages: readonly CourierPackage[],
  own: string,
): Promise<{ from: Version; to: Version }> {
  const from = fromOf(run, packages);
  const latest = run.to ?? (await registry.published("@noverax/courier@latest"))?.version;
  const to = latest === undefined ? undefined : parseVersion(latest);
  if (to === undefined)
    throw new SetupRefusal("VERSION_INVALID", `--to ${run.to ?? "latest"} is no version`);
  if (compareVersions(to, from) < 0)
    throw new SetupRefusal(
      "DOWNGRADE",
      `The project is on ${formatVersion(from)}, after ${formatVersion(to)}: an upgrade does not move back`,
    );
  const mine = parseVersion(own);
  if (mine !== undefined && compareVersions(releaseLine(to), releaseLine(mine)) > 0)
    throw new SetupRefusal(
      "CLI_TOO_OLD",
      `courier-cli ${own} knows the changes up to its own release, and ${formatVersion(to)} is newer: run npx @noverax/courier-cli@latest upgrade`,
    );
  const names = [...new Set(packages.map((each) => each.name))];
  const at = await publishedAt(registry, names, formatVersion(to));
  const missing = names.filter((name) => at.get(name) === undefined);
  if (missing.length > 0)
    throw new SetupRefusal(
      "PACKAGE_MISSING_AT_TARGET",
      `${formatVersion(to)} publishes no ${missing.join(", ")}: name a release that has them with --to`,
    );
  const old = names
    .map((name) => nodeTooOld(name, at.get(name)?.node))
    .find((why) => why !== undefined);
  if (old !== undefined) throw new SetupRefusal("NODE_TOO_OLD", old);
  return { from, to };
}
