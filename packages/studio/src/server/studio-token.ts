/**
 * The token a page presents for Studio to change anything.
 *
 * Studio refuses pages of other sites and domains rebound to this machine,
 * but any process on the machine reaches it with no Origin at all — another
 * account's, or a container's. Reading stays open to it; changing the
 * project, the mocks, the saved sessions or what the Playground sends needs
 * the token, which only the developer has: Studio prints it in its terminal
 * and keeps it in `.courier/studio-token`, readable by its owner alone. It
 * stays the same across restarts, so a page that opened Studio once keeps
 * working.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createLogger } from "@noverax/courier";

import { ensureCourierDir } from "./courier-dir";
import { errnoCode } from "./errno-code";
import { messageOf } from "./message-of";

const log = createLogger("Studio");

/** The token's file, in `.courier` */
export const TOKEN_FILE = "studio-token";

/* 32 random bytes, base64url. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** The token Studio checks, and how it checks one presented. */
export interface StudioToken {
  readonly value: string;
  /** Whether what a caller presented is the token, compared in constant time. */
  matches(candidate: unknown): boolean;
}

/**
 * The project's token: the one `.courier/studio-token` holds, or a new one
 * written there. Where the file cannot be kept — `.courier` is a link, the
 * disk is read-only, the file is another account's — a token for this run
 * alone is made, and Studio says so.
 *
 * @param projectRoot - The project root, links resolved
 * @returns The token
 * @example
 * ```ts
 * const token = studioToken(root);
 * token.matches(req.get("x-courier-studio-token"));
 * ```
 */
export function studioToken(projectRoot: string): StudioToken {
  const value = kept(projectRoot) ?? fresh();
  const expected = Buffer.from(value);
  return {
    value,
    matches(candidate) {
      if (typeof candidate !== "string") return false;
      const given = Buffer.from(candidate);
      return given.length === expected.length && timingSafeEqual(given, expected);
    },
  };
}

function kept(projectRoot: string): string | undefined {
  try {
    const path = join(ensureCourierDir(projectRoot), TOKEN_FILE);
    const existing = read(path);
    if (existing !== undefined) return existing;
    const token = fresh();
    /* Another Studio on the project may write it first; then its token is the one. */
    try {
      writeFileSync(path, `${token}\n`, { mode: 0o600, flag: "wx" });
    } catch (error) {
      if (errnoCode(error) !== "EEXIST") throw error;
      return read(path);
    }
    return token;
  } catch (error) {
    log.warn(
      `Studio could not keep its token in .courier (${messageOf(error)}); this run's token is new`,
    );
    return undefined;
  }
}

/* The token the file holds; a file that holds none is written afresh. */
function read(path: string): string | undefined {
  const stats = lstatSync(path, { throwIfNoEntry: false });
  if (!stats) return undefined;
  if (!stats.isFile()) throw new Error(`${TOKEN_FILE} is not a regular file`);
  if (typeof process.getuid === "function" && stats.uid !== process.getuid()) {
    throw new Error(`${TOKEN_FILE} belongs to another account`);
  }
  if (process.platform !== "win32" && (stats.mode & 0o077) !== 0) chmodSync(path, 0o600);
  const text = readFileSync(path, "utf8").trim();
  if (TOKEN.test(text)) return text;
  const token = fresh();
  writeFileSync(path, `${token}\n`, { mode: 0o600 });
  return token;
}

function fresh(): string {
  return randomBytes(32).toString("base64url");
}
