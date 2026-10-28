import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

/**
 * Put the variables a project's env files give into `process.env` before its
 * config is read, as the framework's own server does: the first file to set
 * a variable wins, and one the process was started with keeps its value.
 *
 * @param files - The env files, absolute, the first winning; one that is not there is passed over
 * @returns The files that were there and were read
 * @example
 * ```ts
 * readEnvFiles(["/app/.env.production.local", "/app/.env.production", "/app/.env.local", "/app/.env"]);
 * ```
 */
export function readEnvFiles(files: readonly string[]): string[] {
  const fromProcess = new Set(Object.keys(process.env));
  const given = new Map<string, string>();
  const read: string[] = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    read.push(file);
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
      if (value !== undefined && !fromProcess.has(key) && !given.has(key)) given.set(key, value);
    }
  }
  for (const [key, value] of given) process.env[key] = value;
  return read;
}
