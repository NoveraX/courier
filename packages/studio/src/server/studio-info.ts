import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { logger } from "@noverax/courier";

import { studioVersion } from "./studio-version";
import type { StudioDemo } from "./types";

/** What a page is told of the Studio it talks to, as `studio:info` on connect. */
export interface StudioInfo {
  /** Studio's own version. */
  version: string;
  /** When Studio started, in epoch milliseconds. */
  startedAt: number;
  project: {
    /** The project's package name, else the name of its folder. */
    name: string;
    /** The packages it depends on, dev ones included, by name and sorted. */
    dependencies: string[];
  };
  /** When the public demo Studio runs as resets; absent when it runs as none. */
  demo?: Pick<StudioDemo, "resetsAt">;
}

interface Manifest {
  name: string | undefined;
  dependencies: string[];
}

const NONE: Manifest = { name: undefined, dependencies: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* What the project's package.json says of it, when it has a usable one. */
function readManifest(projectRoot: string): Manifest {
  const file = join(projectRoot, "package.json");
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    logger.debug("Studio", `${file} gave no project name; the folder's name stands`, error);
    return NONE;
  }
  if (!isRecord(manifest)) return NONE;
  const { name, dependencies, devDependencies } = manifest;
  const names = [dependencies, devDependencies].flatMap((map) =>
    isRecord(map) ? Object.keys(map) : [],
  );
  return {
    name: typeof name === "string" && name.trim() !== "" ? name.trim() : undefined,
    dependencies: [...new Set(names)].sort(),
  };
}

/**
 * What every page is told of this Studio: its version, when it started, and
 * the project it runs — by the `name` in the project's package.json, or the
 * folder's name when there is none to read, with the packages it depends on
 * so the setup can tell its framework.
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
  const manifest = readManifest(projectRoot);
  return {
    version,
    startedAt,
    project: {
      name: manifest.name ?? basename(projectRoot),
      dependencies: manifest.dependencies,
    },
  };
}

/**
 * What a page is told of the public demo Studio runs as: when it resets.
 * How visitors reach it — the proxies it trusts — stays on the server.
 *
 * @param demo - How Studio runs as a public demo
 * @returns The part every page is sent
 * @example
 * ```ts
 * pageDemo({ resetsAt: 1_760_000_000_000, trustedProxies: ["198.51.100.0/24"] });
 * // { resetsAt: 1760000000000 }
 * ```
 */
export function pageDemo({ resetsAt }: StudioDemo): Pick<StudioDemo, "resetsAt"> {
  return { resetsAt };
}
