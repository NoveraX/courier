import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { logger } from "@noverax/courier";

import { studioVersion } from "./studio-version";

/** What a page is told of the Studio it talks to, as `studio:info` on connect. */
export interface StudioInfo {
  /** Studio's own version. */
  version: string;
  /** When Studio started, in epoch milliseconds. */
  startedAt: number;
  project: {
    /** The project's package name, else the name of its folder. */
    name: string;
  };
}

/* The `name` of the project's package.json, when it has a usable one. */
function packageName(projectRoot: string): string | undefined {
  const file = join(projectRoot, "package.json");
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    logger.debug("Studio", `${file} gave no project name; the folder's name stands`, error);
    return undefined;
  }
  if (typeof manifest !== "object" || manifest === null || !("name" in manifest)) return undefined;
  const name = manifest.name;
  return typeof name === "string" && name.trim() !== "" ? name.trim() : undefined;
}

/**
 * What every page is told of this Studio: its version, when it started, and
 * the project it runs by name — the `name` in the project's package.json, or
 * the folder's name when there is none to read.
 *
 * @param projectRoot - The project root, symlinks resolved
 * @param version - Studio's version; the installed one unless a test stands in
 * @param startedAt - When Studio started; now, as Studio builds it once at start
 * @returns The info, sent as `studio:info` to each page that connects
 * @example
 * ```ts
 * socket.emit("studio:info", studioInfo(projectRoot));
 * ```
 */
export function studioInfo(
  projectRoot: string,
  version: string = studioVersion(),
  startedAt: number = Date.now(),
): StudioInfo {
  return {
    version,
    startedAt,
    project: { name: packageName(projectRoot) ?? basename(projectRoot) },
  };
}
