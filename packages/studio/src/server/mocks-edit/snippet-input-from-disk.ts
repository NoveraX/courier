import { lstatSync } from "node:fs";
import { basename } from "node:path";
import { createLogger } from "@noverax/courier";
import { findConfigFileAt, findMocksFile } from "@noverax/courier-studio-core/config";
import { mocksFileNameFor } from "./mocks-file-name";
import type { PlanInput } from "./plan/types";
import { readMocksText } from "./read-mocks-text";
import type { MockDeclaration } from "./types";
import { writesExplicitExtensions } from "./writes-explicit-extensions";

const log = createLogger("Studio");

/* Larger files are not read for a snippet; the snippet then gives every line. */
const SNIPPET_READ_LIMIT = 1024 * 1024;

/**
 * What a snippet is built from when Studio stops before planning the edit:
 * the project's mocks file when it has one — its text when it can be read
 * safely, so the snippet adds only the imports it lacks — or a new file
 * beside the config; and whether the project names the files of its
 * relative imports with their extensions, as the edit would.
 *
 * A mocks file that exists is never answered with a whole new file: pasting
 * that over it would drop the mocks it declares.
 *
 * @param root - The project root, symlinks resolved
 * @param requests - The mocks asked for
 * @returns The snippet's input
 */
export function snippetInputFromDisk(
  root: string,
  requests: readonly MockDeclaration[],
): PlanInput {
  const configPath = findConfigFileAt(root);
  const configName = configPath ? basename(configPath) : "courier.config.ts";
  const found = findMocksFile(root);
  const name = found ? basename(found) : mocksFileNameFor(configName);
  return {
    existing: found ? { name, text: readQuietly(found, name) } : null,
    createName: name,
    configName,
    configText: null,
    explicitExtensions: writesExplicitExtensions(root, name, configName),
    requests,
  };
}

function readQuietly(path: string, name: string): string | null {
  const stats = lstatSync(path, { throwIfNoEntry: false });
  if (!stats?.isFile() || stats.size > SNIPPET_READ_LIMIT) return null;
  try {
    return readMocksText(path, stats, name).text;
  } catch (err) {
    log.debug(`The snippet gives every import, since ${name} could not be read`, err);
    return null;
  }
}
