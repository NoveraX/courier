import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

/**
 * Put the variables a project's env files give into `process.env` before its
 * config is read, as the framework's own server does: the first file to set
 * a variable wins, and one the process was started with keeps its value.
 * The bundler's own reading of them, when given, stands in for this one, so
 * a value built of others with `${VAR}` is the one the app sees.
 *
 * @param files - The env files, absolute, the first winning; one that is not there is passed over
 * @param given - The variables the bundler read from them, in place of reading them here
 * @returns The files that were there
 * @example
 * ```ts
 * readEnvFiles(["/app/.env.production.local", "/app/.env.production", "/app/.env.local", "/app/.env"]);
 * ```
 */
export function readEnvFiles(
  files: readonly string[],
  given?: Readonly<Record<string, string>>,
): string[] {
  const fromProcess = new Set(Object.keys(process.env));
  const present = files.filter((file) => existsSync(file));
  const values = given === undefined ? Object.entries(parsedFrom(present)) : Object.entries(given);
  for (const [key, value] of values) if (!fromProcess.has(key)) process.env[key] = value;
  return present;
}

/* Each variable the files set, the first file to set one winning. */
function parsedFrom(files: readonly string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const file of files) {
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
      if (value !== undefined && !(key in parsed)) parsed[key] = value;
    }
  }
  return parsed;
}
