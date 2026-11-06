import type { CourierPackage } from "./project-packages";
import { compareVersions, parseVersion, type Version } from "./versions";

const DOCS = "@noverax/courier-docs";
/* The release @noverax/courier-docs first ships with: an older one has no docs to point the agent at. */
const DOCS_SINCE = parseVersion("0.5.0");
const NOTE =
  "@noverax/courier-docs, the docs of the Courier you install, is not in the project: npx @noverax/courier-cli setup --agents-md, in the package that uses Courier, installs it and points your editor's agent at it in AGENTS.md.";

/**
 * The note an upgrade's plan gives where no manifest of the workspace
 * lists the docs of the release it moves to: the command that installs
 * them and writes Courier's block in AGENTS.md. The upgrade installs
 * nothing it was not asked for, so it only names the command.
 *
 * @param packages - Courier's packages, as the workspace's manifests list them
 * @param to - The release the upgrade moves to
 * @returns The note, or none where the docs are listed or the release has none
 * @example
 * ```ts
 * docsNote(courierPackages(workspace), parseVersion("0.5.0")!); // ["@noverax/courier-docs, the docs of …"]
 * ```
 */
export function docsNote(packages: readonly CourierPackage[], to: Version): string[] {
  if (packages.some((each) => each.name === DOCS)) return [];
  if (DOCS_SINCE === undefined || compareVersions(to, DOCS_SINCE) < 0) return [];
  return [NOTE];
}
