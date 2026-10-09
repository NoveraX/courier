import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { isDefinedApi } from "@noverax/courier/internal";
import { toOpenAPI } from "@noverax/courier/openapi";

import { loadCourierConfig } from "../../server/config-loader";
import { ensureCourierDir } from "../../server/courier-dir";
import { messageOf } from "../../server/message-of";
import type { Schema } from "./schema-relation";

/**
 * The project's definition as OpenAPI documents, one per source, read from
 * `courier.config.ts` as Studio reads it.
 *
 * @param root - The project root
 * @returns The documents, by source
 * @example
 * ```ts
 * const head = await definitionDocuments(process.cwd());
 * ```
 */
export async function definitionDocuments(root: string): Promise<Record<string, Schema>> {
  const { config } = await loadCourierConfig(root);
  return documentsOf(config.sources);
}

/**
 * Sources as OpenAPI documents, one per source; a value that is not an API
 * is passed over.
 *
 * @param sources - A config's sources
 * @returns The documents, by source
 * @example
 * ```ts
 * documentsOf(config.sources).shop?.paths;
 * ```
 */
export function documentsOf(sources: Readonly<Record<string, unknown>>): Record<string, Schema> {
  const documents: Record<string, Schema> = {};
  for (const [name, source] of Object.entries(sources)) {
    if (!isDefinedApi(source)) continue;
    const document: unknown = toOpenAPI(source, { openapi: "3.1.0" });
    if (isSchema(document)) documents[name] = document;
  }
  return documents;
}

/**
 * The definition at a git ref — `origin/main`, a tag, a commit — as OpenAPI
 * documents: the ref is checked out in a worktree of its own inside
 * `.courier`, which keeps itself out of git, so its config resolves the
 * project's installed packages; the worktree is removed afterwards.
 *
 * @param root - The project root, inside a git repository
 * @param ref - The ref to read the base definition at
 * @returns Its documents, by source
 * @throws {Error} When git cannot check the ref out, or its config does not load
 * @example
 * ```ts
 * const base = await documentsAtRef(process.cwd(), "origin/main");
 * ```
 */
export async function documentsAtRef(root: string, ref: string): Promise<Record<string, Schema>> {
  const repository = git(root, ["rev-parse", "--show-toplevel"]).trim();
  const worktree = join(ensureCourierDir(root), `diff-base-${randomBytes(4).toString("hex")}`);
  git(root, ["worktree", "add", "--detach", "--quiet", worktree, ref]);
  try {
    /* git names the repository by its real path: `/private/var/…` for a project under `/var/…` on macOS. */
    return await definitionDocuments(
      join(worktree, relative(repository, realpathSync(resolve(root)))),
    );
  } finally {
    git(root, ["worktree", "remove", "--force", worktree]);
  }
}

/**
 * OpenAPI documents written before, as `courier-studio openapi --out <dir>`
 * writes them: each `<source>.openapi.json` in a folder, or one file.
 *
 * @param path - The folder or the file
 * @returns The documents, by source
 * @throws {Error} When the path holds no document
 * @example
 * ```ts
 * const base = documentsInFiles("openapi/");
 * ```
 */
export function documentsInFiles(path: string): Record<string, Schema> {
  if (!existsSync(path)) throw new Error(`${path} does not exist`);
  const files = statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((name) => name.endsWith(".json"))
        .map((name) => join(path, name))
    : [path];
  const documents: Record<string, Schema> = {};
  for (const file of files) {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (isSchema(parsed) && isSchema(parsed.paths)) {
      documents[basename(file).replace(/(\.openapi)?\.json$/, "")] = parsed;
    }
  }
  if (Object.keys(documents).length === 0) throw new Error(`${path} holds no OpenAPI document`);
  return documents;
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const stderr =
      typeof error === "object" && error !== null && "stderr" in error
        ? String(error.stderr).trim()
        : "";
    throw new Error(`git ${args[0]} failed: ${stderr || messageOf(error)}`);
  }
}

function isSchema(value: unknown): value is Schema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
