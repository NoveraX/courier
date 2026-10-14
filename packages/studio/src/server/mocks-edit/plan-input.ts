import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@noverax/courier";
import { writesExplicitExtensions } from "@noverax/courier-cli/devkit";
import type { MocksTarget } from "./inspect-mocks-target";
import type { PlanInput } from "./plan/types";
import type { MockDeclaration } from "./types";

const log = createLogger("Studio");

/**
 * What the planner is given for an inspected target: the file's text, or
 * the file to create, the config whose style a created file follows, and
 * whether the project names the files of its relative imports with their
 * extensions.
 *
 * @param root - The project root, symlinks resolved
 * @param target - The inspected mocks file
 * @param requests - The mocks to add
 * @returns The planner's input
 */
export function planInputFor(
  root: string,
  target: MocksTarget,
  requests: readonly MockDeclaration[],
): PlanInput {
  const { name, configName } = target;
  const configText = readConfigText(join(root, configName));
  const existing = target.kind === "existing" ? { name, text: target.text } : null;
  const explicitExtensions = writesExplicitExtensions(root, name, configName);
  return { existing, createName: name, configName, configText, explicitExtensions, requests };
}

/* Only the style of a created file depends on it, so an unreadable config
   costs the defaults, not the edit. */
function readConfigText(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch (err) {
    log.debug(`Could not read ${file} for its style`, err);
    return null;
  }
}
