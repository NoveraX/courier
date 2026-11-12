/**
 * Which variables of an environment a quoted message shows the values of
 * rather than masks them. A variable the system sets for every process by
 * its own name — `PATH`, `HOME`, `PWD`, the user, the shell — is shown.
 * Any other whose name says it holds a secret, read as the core reads a
 * record's field of that name, is masked whatever it holds, one of a
 * family the system names by a prefix too, as npm's `npm_config__auth`
 * is. The rest are shown where they are of such a family — npm's settings,
 * the locale — or name places: an absolute path, or a list of them, as
 * `RUNNER_TEMP`, `APPDATA` and `NODE_PATH` hold. Masking those would take
 * the path out of every file a message names, and a machine sets more of
 * them than a list of names could know.
 *
 * A path is read as the platform reads one, and on Windows a name in any
 * case, as Windows reads it. A path holding a run of 16 letters and digits
 * mixing both — a key in hex or base64, which may start with `/`, or a
 * token in a path, as a webhook's is — names no place and is masked. The
 * folders a system variable names are read past: the system names its
 * own, at random as macOS names a user's temporary folder.
 */

import { posix, win32 } from "node:path";

import { isSecretValue } from "@noverax/courier/internal";

/** An environment, as a process holds it. */
type Environment = Readonly<Record<string, string | undefined>>;

/** Variables a POSIX system, its shells and npm set for every process: paths and settings. */
const POSIX_VARIABLES: readonly string[] = [
  "PATH",
  "HOME",
  "PWD",
  "OLDPWD",
  "INIT_CWD",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SHELL",
  "USER",
  "USERNAME",
  "LOGNAME",
  "HOSTNAME",
  "LANG",
  "LANGUAGE",
  "TERM",
  "TERM_PROGRAM",
  "TERM_PROGRAM_VERSION",
  "COLORTERM",
  "EDITOR",
  "VISUAL",
  "PAGER",
  "NODE",
  "NODE_ENV",
  "CI",
  "COURIER_PHASE",
];
/** Variables Windows sets for every process that hold no path: the machine's names and settings. */
const WINDOWS_VARIABLES: readonly string[] = [
  "COMPUTERNAME",
  "USERDOMAIN",
  "USERDOMAIN_ROAMINGPROFILE",
  "OS",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION",
  "NUMBER_OF_PROCESSORS",
  "SESSIONNAME",
];
const SYSTEM_PREFIXES: readonly string[] = [
  "LC_",
  "XDG_",
  "npm_config_",
  "npm_package_",
  "npm_lifecycle_",
];

/** The shortest run of a key's characters, mixing letters with digits, taken for a key. */
const KEY_RUN = 16;
/* What a key's characters — letters, digits, and base64's `+` and `=` — are split into runs by. */
const NO_KEY_CHARACTERS = /[^A-Za-z0-9+=]+/;
const LETTER = /[A-Za-z]/;
const DIGIT = /\d/;

/** How a platform names its variables and spells its paths. */
interface Platform {
  readonly path: typeof posix;
  readonly separators: RegExp;
  readonly caseless: boolean;
  readonly names: ReadonlySet<string>;
  readonly prefixes: readonly string[];
}

const POSIX: Platform = {
  path: posix,
  separators: /\/+/,
  caseless: false,
  names: new Set(POSIX_VARIABLES),
  prefixes: SYSTEM_PREFIXES,
};
const WINDOWS: Platform = {
  path: win32,
  separators: /[\\/]+/,
  caseless: true,
  names: new Set([...POSIX_VARIABLES, ...WINDOWS_VARIABLES]),
  prefixes: SYSTEM_PREFIXES.map((prefix) => prefix.toUpperCase()),
};

/**
 * What tells whether a variable of the environment is shown in a quoted
 * message, by the rules above, on the platform this process runs on.
 *
 * @param env - The environment the variables are of
 * @returns Whether a variable, by its name and value, is shown
 * @example
 * ```ts
 * const shown = shownVariables(process.env);
 * shown("RUNNER_TEMP", "/home/runner/work/_temp"); // → true
 * shown("DATABASE_URL", "postgres://u:p@db/app"); // → false
 * ```
 */
export function shownVariables(env: Environment): (name: string, value: string) => boolean {
  const platform = process.platform === "win32" ? WINDOWS : POSIX;
  const places = systemPlaces(env, platform);
  return (name, value) => {
    if (isSystemName(name, platform)) return true;
    if (isSecretValue(name, value)) return false;
    return isSystemFamily(name, platform) || namesPlaces(value, places, platform);
  };
}

function isSystemName(name: string, platform: Platform): boolean {
  return platform.names.has(platform.caseless ? name.toUpperCase() : name);
}

function isSystemFamily(name: string, platform: Platform): boolean {
  const read = platform.caseless ? name.toUpperCase() : name;
  return platform.prefixes.some((prefix) => read.startsWith(prefix));
}

/* The folders of every absolute path the variables the system names hold. */
function systemPlaces(env: Environment, platform: Platform): string[][] {
  return Object.entries(env).flatMap(([name, value]) =>
    value === undefined || !isSystemName(name, platform)
      ? []
      : entriesOf(value, platform)
          .filter((entry) => platform.path.isAbsolute(entry))
          .map((entry) => foldersOf(entry, platform)),
  );
}

function namesPlaces(value: string, places: readonly string[][], platform: Platform): boolean {
  const entries = entriesOf(value, platform);
  return (
    entries.length > 0 &&
    entries.every(
      (entry) =>
        platform.path.isAbsolute(entry) &&
        !holdsKey(pastPlaces(foldersOf(entry, platform), places, platform)),
    )
  );
}

function entriesOf(value: string, platform: Platform): string[] {
  return value.split(platform.path.delimiter).filter((entry) => entry !== "");
}

function foldersOf(path: string, platform: Platform): string[] {
  return path.split(platform.separators).filter((folder) => folder !== "");
}

/* A path's folders past the deepest of the places it lies in. */
function pastPlaces(
  folders: readonly string[],
  places: readonly string[][],
  platform: Platform,
): readonly string[] {
  let depth = 0;
  for (const place of places) {
    const within =
      place.length > depth &&
      place.length <= folders.length &&
      place.every((folder, at) => sameName(folder, folders[at], platform));
    if (within) depth = place.length;
  }
  return folders.slice(depth);
}

function sameName(a: string, b: string | undefined, platform: Platform): boolean {
  return platform.caseless ? a.toLowerCase() === b?.toLowerCase() : a === b;
}

function holdsKey(folders: readonly string[]): boolean {
  return folders.some((folder) =>
    folder
      .split(NO_KEY_CHARACTERS)
      .some((run) => run.length >= KEY_RUN && LETTER.test(run) && DIGIT.test(run)),
  );
}
