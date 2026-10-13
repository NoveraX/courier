import { realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";

import { foldersOf } from "./folders-of";
import type { MachinePaths } from "./machine-paths";
import { type PathStyle, PLATFORM_STYLE } from "./path-style";

/** What Studio asks of the machine it runs on to know its directories by every name. */
export interface Machine {
  /** The home directory, as the platform gives it. */
  home(): string;
  /** The temporary directory, as the platform gives it. */
  temp(): string;
  /** A path with its links resolved and its names as the disk stores them; `null` when it does not resolve. */
  realpath(path: string): string | null;
  /** How the machine spells paths. */
  readonly style: PathStyle;
}

/** The machine Studio runs on. */
export const THIS_MACHINE: Machine = {
  home: homedir,
  temp: tmpdir,
  realpath: (path) => {
    try {
      return realpathSync.native(path);
    } catch {
      /* A directory that does not resolve is known by the name it was given alone. */
      return null;
    }
  },
  style: PLATFORM_STYLE,
};

/**
 * The directories a text should not name, each by every name it goes by on
 * the machine: as given, and with its links resolved as the disk stores it
 * — `/private/var/…` for macOS' `/var/…`, a long name for Windows' 8.3 one
 * such as `ANA~1`. The home and temporary directories are the machine's
 * unless given. A short name of the home directory that the temporary
 * directory's path gives away is one of its names too, and the temporary
 * directory is left out where it lies in the home directory, which names
 * its paths already.
 *
 * @param paths - The project's directory, and the home and temporary directories when not the machine's
 * @param machine - The machine; the one Studio runs on by default
 * @returns The directories, each by all its names, for `pathScrubber`
 * @example
 * ```ts
 * const scrub = pathScrubber(machineSpellings({ project: [root] }));
 * ```
 */
export function machineSpellings(
  paths: MachinePaths,
  machine: Machine = THIS_MACHINE,
): MachinePaths {
  const temps = listOf(paths.temp ?? machine.temp());
  const homes = spellings(listOf(paths.home ?? machine.home()), machine);
  const home = [...homes, ...shortHomes(homes, temps, machine)];
  const temp = spellings(temps, machine).filter(
    (dir) => !home.some((each) => isInside(each, dir, machine.style)),
  );
  return { project: spellings(paths.project, machine), home, temp };
}

function spellings(names: readonly string[], machine: Machine): string[] {
  return [...new Set(names.flatMap((name) => [name, machine.realpath(name) ?? name]))];
}

/* Where the temporary directory's own name and its resolved one differ only
   before the folders they end in alike, that start names the same directory:
   `C:\Users\ANA~1` for `C:\Users\ana` when the one is `…\ANA~1\AppData\Local\Temp`. */
function shortHomes(
  homes: readonly string[],
  temps: readonly string[],
  machine: Machine,
): string[] {
  const { style } = machine;
  return temps.flatMap((temp) => {
    const real = machine.realpath(temp);
    if (real === null) return [];
    const [given, resolved] = withoutSharedEnd(
      foldersOf(temp, style),
      foldersOf(real, style),
      style,
    );
    const named = homes.some((home) => sameFolders(foldersOf(home, style), resolved, style));
    return named && !sameFolders(given, resolved, style)
      ? [given.join(style.windows ? "\\" : "/")]
      : [];
  });
}

function withoutSharedEnd(a: string[], b: string[], style: PathStyle): [string[], string[]] {
  let end = 0;
  while (
    end < a.length - 1 &&
    end < b.length - 1 &&
    sameName(a.at(-1 - end), b.at(-1 - end), style)
  ) {
    end += 1;
  }
  return [a.slice(0, a.length - end), b.slice(0, b.length - end)];
}

function isInside(parent: string, child: string, style: PathStyle): boolean {
  const outer = foldersOf(parent, style);
  const inner = foldersOf(child, style);
  return inner.length >= outer.length && sameFolders(outer, inner.slice(0, outer.length), style);
}

function sameFolders(a: readonly string[], b: readonly string[], style: PathStyle): boolean {
  return a.length === b.length && a.every((name, index) => sameName(name, b[index], style));
}

function sameName(a: string | undefined, b: string | undefined, style: PathStyle): boolean {
  return style.caseless ? a?.toLowerCase() === b?.toLowerCase() : a === b;
}

function listOf(names: string | readonly string[]): readonly string[] {
  return typeof names === "string" ? [names] : names;
}
