import { posix } from "node:path";
import { withoutTrailingSlashes } from "@noverax/courier/internal";

import { MAX_NAME_LENGTH } from "../max-name-length";
import { hasControlCharacter } from "./has-control-character";
import { InvalidImportError } from "./invalid-import-error";
import { isWindowsDevice } from "./windows-device";

const DRIVE_PREFIX = /^[A-Za-z]:/;
/** Folders Studio never writes generated files into, by name in lower case. */
export const STUDIO_OFF_LIMITS: ReadonlySet<string> = new Set([".git", "node_modules", ".courier"]);
/** The longest output directory Studio takes, as typed. */
const MAX_DIR_LENGTH = 240;
const WINDOWS_FORBIDDEN = /[<>"|?*]/;
const SHORT_NAME = /~\d/;

/**
 * Put a declared output directory in the one spelling every path Studio
 * derives from it uses: NFC, `/` separators, no `./`, no doubled or trailing
 * slash. `./src/api/`, `src//api` and `src\api` all become `src/api`, so a
 * path read from disk and a path the generator made compare equal.
 *
 * Refused: an empty or absolute directory, one on a drive or share, one
 * that leaves the project, anything under `.git`, `node_modules` or
 * `.courier`, where generated files do not belong, and a name Windows reads
 * as another: one ending in a dot or a space (`.git.` is `.git`), a device
 * name, an 8.3 short name (`GIT~1`), or one holding `:`, a NUL byte or
 * `<>"|?*`.
 *
 * @param raw - The directory as declared, relative to the project
 * @returns The canonical directory, or `.` for the project itself
 * @throws {InvalidImportError} When the directory is refused
 * @example
 * ```ts
 * canonicalOutputDir("./src//api/"); // "src/api"
 * canonicalOutputDir("../lib"); // throws
 * ```
 */
export function canonicalOutputDir(raw: string): string {
  const slashed = raw.normalize("NFC").replaceAll("\\", "/").trim();
  const problem = problemWith(slashed);
  if (problem !== null) throw new InvalidImportError("outputDir", raw, problem);
  const normal = withoutTrailingSlashes(posix.normalize(slashed));
  if (normal === ".." || normal.startsWith("../")) {
    throw new InvalidImportError("outputDir", raw, "it leaves the project");
  }
  const offLimits = normal.split("/").find((name) => STUDIO_OFF_LIMITS.has(name.toLowerCase()));
  if (offLimits !== undefined) {
    throw new InvalidImportError("outputDir", raw, `generated files do not belong in ${offLimits}`);
  }
  return normal === "" ? "." : normal;
}

function problemWith(slashed: string): string | null {
  if (slashed === "") return "it is empty";
  if (slashed.includes("\0")) return "it holds a NUL byte";
  if (hasControlCharacter(slashed)) return "it holds a control character";
  if (slashed.length > MAX_DIR_LENGTH) return `it is longer than ${MAX_DIR_LENGTH} characters`;
  if (posix.isAbsolute(slashed) || DRIVE_PREFIX.test(slashed)) {
    return "it must be relative to the project";
  }
  const names = slashed.split("/").filter((name) => name !== "" && name !== "." && name !== "..");
  const odd = names.find((name) => windowsProblem(name) !== null);
  return odd === undefined ? null : `the name ${JSON.stringify(odd)} ${windowsProblem(odd)}`;
}

function windowsProblem(name: string): string | null {
  if (name.includes(":")) return "holds ':'";
  if (WINDOWS_FORBIDDEN.test(name)) return 'holds one of <>"|?*';
  if (/[. ]$/.test(name)) return "ends in a dot or a space, which Windows drops";
  if (isWindowsDevice(name)) return "is a name Windows keeps for a device";
  if (name.length > MAX_NAME_LENGTH) return `is longer than ${MAX_NAME_LENGTH} characters`;
  if (SHORT_NAME.test(name))
    return "looks like a Windows short name, which may alias another directory";
  return null;
}
