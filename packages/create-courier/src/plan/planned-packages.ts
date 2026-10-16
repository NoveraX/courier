import type { Project } from "../project/read-project";
import { packageName } from "./planned-parts";

/** A package the project has at a release line other than the one the setup is written for. */
export interface OtherRelease {
  readonly name: string;
  /** What the project has: the version installed, else its range. */
  readonly has: string;
  /** The range the setup is written for. */
  readonly wants: string;
}

/* The release line a version is on, as a caret range reads it: its major, or under 1.0 its minor too. */
function lineOf(version: string): string | undefined {
  const [major, minor] = /^(\d+)\.(\d+)/.exec(version)?.slice(1) ?? [];
  if (major === undefined || minor === undefined) return undefined;
  return major === "0" ? `0.${minor}` : major;
}

/**
 * The packages of a list the project does not have yet: listed as a
 * dependency or a dev one, or as a peer or an optional one Node finds
 * installed.
 *
 * @param project - The project
 * @param specs - The packages, each with its range where it has one
 * @returns Those it lacks
 * @example
 * ```ts
 * missingPackages(project, ["@noverax/courier@^0.3.0", "zod"]); // ["@noverax/courier@^0.3.0"] where zod is there
 * ```
 */
export function missingPackages(project: Project, specs: readonly string[]): string[] {
  return specs.filter((spec) => !project.has(packageName(spec)));
}

/**
 * The packages of a list the project names as a peer or an optional
 * dependency, which Node does not find installed: added with the rest,
 * and the plan says why.
 *
 * @param project - The project
 * @param specs - The packages, each with its range where it has one
 * @returns Their names
 * @example
 * ```ts
 * listedNotInstalled(project, ["zod"]); // ["zod"] where peerDependencies lists it and nothing installed it
 * ```
 */
export function listedNotInstalled(project: Project, specs: readonly string[]): string[] {
  return specs.map(packageName).filter((name) => project.lists(name) && !project.has(name));
}

/**
 * The packages of a list the project has on another release line than
 * the setup's range: they are left as they are, and the plan says so,
 * since the files the setup writes are written for the range.
 *
 * @param project - The project
 * @param specs - The packages, each with its range where it has one
 * @returns Those on another line; a package without a range, or with a version not read, is never one
 * @example
 * ```ts
 * otherReleases(project, ["@noverax/courier@^0.3.0"]); // [{ name: "@noverax/courier", has: "0.2.1", wants: "^0.3.0" }]
 * ```
 */
export function otherReleases(project: Project, specs: readonly string[]): OtherRelease[] {
  return specs.flatMap((spec) => {
    const name = packageName(spec);
    const wants = spec.slice(name.length + 1);
    const version = project.version(name);
    if (!wants.startsWith("^") || version === undefined || !project.lists(name)) return [];
    const has = lineOf(version);
    const wanted = lineOf(wants.slice(1));
    if (has === undefined || wanted === undefined || has === wanted) return [];
    return [{ name, has: project.shown(name) ?? version, wants }];
  });
}
