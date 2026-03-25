/**
 * Resolves environment variables for the scanner.
 *
 * Priority: connected app's process.env → studio server process.env → project .env files.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getProjectRoot } from "../../context";
import { getRuntimeEnvVar } from "../../runtime-env";

const ENV_FILES = [".env", ".env.local", ".env.development", ".env.development.local"];

/**
 * Resolve an environment variable by name.
 *
 * 1. Runtime env from the connected app (via Socket.IO)
 * 2. Studio server's own process.env
 * 3. Project .env files (fallback when app is not running)
 */
export function resolveEnvVar(varName: string): string | null {
  return getRuntimeEnvVar(varName) ?? resolveLocalEnvVar(varName);
}

/** Fallback: check studio server process.env, then .env files */
function resolveLocalEnvVar(varName: string): string | null {
  if (process.env[varName]) return process.env[varName]!;
  return loadProjectEnv().get(varName) ?? null;
}

/** Parse all .env files in the project root into a merged Map */
function loadProjectEnv(): Map<string, string> {
  const root = getProjectRoot();
  const env = new Map<string, string>();

  for (const file of ENV_FILES) {
    try {
      const content = readFileSync(join(root, file), "utf-8");
      parseEnvFile(content, env);
    } catch {
      /* file doesn't exist — skip */
    }
  }

  return env;
}

/** Parse KEY=value lines from a .env file */
function parseEnvFile(content: string, out: Map<string, string>): void {
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    /* Strip surrounding quotes */
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out.set(key, value);
  }
}
