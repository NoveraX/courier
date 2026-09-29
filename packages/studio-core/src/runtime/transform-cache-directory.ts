import { lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createLogger } from "@noverax/courier";
import { type TrustOptions, whyUntrusted } from "./why-untrusted";

const log = createLogger("Studio");

/** Values of `COURIER_TRANSFORM_CACHE` that turn the directory off. */
const OFF_VALUES: ReadonlySet<string> = new Set(["0", "false", "off"]);

/** Values of `COURIER_TRANSFORM_CACHE` that keep it, as leaving it unset does. */
const ON_VALUES: ReadonlySet<string> = new Set(["", "1", "true", "on"]);

/* Each value Studio does not know is said once, not at every load. */
const unknownSettings = new Set<string>();

/* The first entry named node_modules at or above `start` that is a
   directory or a link; a file of that name is passed over, as module
   resolution passes over it. */
function nearestNodeModules(start: string): string | null {
  let directory = start;
  while (true) {
    const candidate = join(directory, "node_modules");
    const stats = lstatSync(candidate, { throwIfNoEntry: false });
    if (stats?.isDirectory() || stats?.isSymbolicLink()) return candidate;
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

/* Only the directories that exist are judged: one still missing is created
   by this user, with mode 0700, at the first write, and judged again then. */
function whyRefused(levels: ReadonlyArray<[string, TrustOptions]>): string | null {
  for (const [path, options] of levels) {
    const stats = lstatSync(path, { throwIfNoEntry: false });
    const reason = stats === undefined ? null : whyUntrusted(stats, "directory", options);
    if (reason !== null) return `${path} is ${reason}`;
  }
  return null;
}

/* npm, pnpm and other tools create node_modules and .cache under the user's
   umask, group-writable under 002; whoever can write node_modules can replace
   any package in it anyway, so only a link or another owner refuses them. */
const TOOL_OWNED: TrustOptions = { allowSharedWrite: true };
const STUDIO_OWNED: TrustOptions = {};

type Located = { directory: string; refusal?: undefined } | { refusal: string };

/* The reason last logged for each root. Studio looks the directory up again
   on every load, so the reason is logged when it first applies and again only
   once it changes, or applies anew after a lookup that found the directory. */
const lastRefusals = new Map<string, string>();

function refuse(root: string, reason: string, error?: unknown): null {
  const key = error instanceof Error ? `${reason}\0${error.message}` : reason;
  if (lastRefusals.get(root) === key) return null;
  lastRefusals.set(root, key);
  if (error === undefined) log.debug(`Transform cache directory off: ${reason}`);
  else log.debug(`Transform cache directory off: ${reason}`, error);
  return null;
}

function locate(projectRoot: string): Located {
  const nodeModules = nearestNodeModules(projectRoot);
  if (nodeModules === null) return { refusal: `no node_modules at or above ${projectRoot}` };
  const cache = join(nodeModules, ".cache");
  const courier = join(cache, "courier");
  const directory = join(courier, "transform");
  const refusal = whyRefused([
    [nodeModules, TOOL_OWNED],
    [cache, TOOL_OWNED],
    [courier, STUDIO_OWNED],
    [directory, STUDIO_OWNED],
  ]);
  return refusal === null ? { directory } : { refusal };
}

/**
 * Where a project's transforms are kept across processes:
 * `.cache/courier/transform` in the nearest `node_modules` directory at or
 * above the project root.
 *
 * The nearest one is taken, not the one module resolution would reach: under
 * pnpm that lies inside `.pnpm`, and what keeps the directory safe is the
 * rule below, not where it is. Every file in it holds code that Studio, mock
 * workers and build plugins run, so on POSIX the directory is refused when
 * `node_modules`, `.cache`, `courier` or `transform` — those that exist — is
 * a symbolic link or belongs to another user, and when `courier` or
 * `transform`, which only Studio creates, is writable by its group or
 * others; any of these lets someone else replace or remove entries, or put
 * the directory somewhere they control. `node_modules` and `.cache` may be
 * group-writable, as package managers leave them under a umask of 002:
 * whoever can write `node_modules` can replace any package in it already. On
 * Windows only links and other kinds of file are refused.
 *
 * There is none when no `node_modules` exists, as with Yarn Plug'n'Play, or
 * when `COURIER_TRANSFORM_CACHE` is `0`, `false` or `off` in any case. The
 * system temporary directory, which every user of the machine may write, is
 * never used instead. Why there is none is logged at debug level, once for
 * each root until the reason changes, however often the root is looked up.
 *
 * @param projectRoot - The directory holding `courier.config.*`
 * @param env - The environment to read `COURIER_TRANSFORM_CACHE` from
 *   (default: `process.env`)
 * @returns The directory, which may not exist yet, or `null` for none
 * @example
 * ```ts
 * const transformCache = createTransformCache({
 *   directory: findTransformCacheDirectory(projectRoot),
 * });
 * ```
 */
export function findTransformCacheDirectory(
  projectRoot: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const root = resolve(projectRoot);
  const setting = env.COURIER_TRANSFORM_CACHE?.trim().toLowerCase();
  if (setting !== undefined && OFF_VALUES.has(setting)) {
    return refuse(root, `COURIER_TRANSFORM_CACHE=${setting}`);
  }
  if (setting !== undefined && !ON_VALUES.has(setting) && !unknownSettings.has(setting)) {
    unknownSettings.add(setting);
    log.warn(
      `COURIER_TRANSFORM_CACHE=${setting} is not one of 0, false, off, 1, true or on; the transform cache stays on`,
    );
  }
  let located: Located;
  try {
    located = locate(root);
  } catch (error) {
    return refuse(root, `cannot inspect the directories above ${root}`, error);
  }
  if (located.refusal !== undefined) return refuse(root, located.refusal);
  lastRefusals.delete(root);
  return located.directory;
}
