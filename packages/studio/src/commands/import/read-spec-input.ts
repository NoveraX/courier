import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { CourierImportAuth, CourierImportType } from "@noverax/courier/config";
import { parseUrl } from "@noverax/courier/internal";

import { fetchSpec } from "../../server/fetch-spec";
import { importAuthHeaders } from "../../server/import-auth-headers";
import type { ProjectReads } from "../../server/project-state/types";
import { SPEC_MAX_BYTES } from "../../server/read-spec-body";
import { specHostAllowlist } from "../../server/spec-host-allowlist";

/** A specification as the command was given it. */
export interface SpecInput {
  /** Its text. */
  raw: string;
  /** How it was given, as the import's declaration records it. */
  importType: CourierImportType;
  /** Where it was fetched from, for a URL. */
  url?: string | undefined;
  /** What it was fetched with, each credential named by its environment variable. */
  auth?: CourierImportAuth | undefined;
}

const MB = 1024 * 1024;
const URL_PATTERN = /^https?:\/\//i;
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);
/* A Windows path, `C:\specs\openapi.json`, whose drive a URL parser reads as a scheme. */
const DRIVE = /^[A-Za-z]:[\\/]/;

function withoutMark(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/*
 * The address the command was given, read as the core reads one — trimmed,
 * then parsed — so that a space a paste left before it, or `\\` or one
 * slash for `//`, still makes it the address it is, its credentials refused.
 */
function addressOf(given: string): URL | undefined {
  const read = parseUrl(given.trim());
  return read !== undefined && WEB_PROTOCOLS.has(read.protocol) ? read : undefined;
}

/* A path the URL parser reads as an address of another scheme — ftp://… — is not said back: it may carry a user and a password. */
function shownPath(given: string, path: string): string {
  const trimmed = given.trim();
  return parseUrl(trimmed) === undefined || DRIVE.test(trimmed)
    ? path
    : "the path given, which reads as an address";
}

function readSpecFile(path: string, shown: string): string {
  const stats = statSync(path, { throwIfNoEntry: false });
  if (stats === undefined) throw new Error(`There is no file at ${shown}`);
  if (!stats.isFile()) throw new Error(`What is at ${shown} is not a file`);
  if (stats.size > SPEC_MAX_BYTES) {
    throw new Error(`The file at ${shown} is larger than ${SPEC_MAX_BYTES / MB} MB`);
  }
  return withoutMark(readFileSync(path, "utf8"));
}

async function readStream(input: AsyncIterable<Buffer | string>): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of input) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += bytes.length;
    if (size > SPEC_MAX_BYTES)
      throw new Error(`The specification is larger than ${SPEC_MAX_BYTES / MB} MB`);
    chunks.push(bytes);
  }
  return withoutMark(Buffer.concat(chunks).toString("utf8"));
}

/**
 * Read the specification the command names, as Import API reads one: a URL
 * is fetched by the same rules — a public host, or this machine when the
 * URL points there, and a host on a private network only when
 * `studio.allowedSpecHosts` names it — while a file is read from where the
 * command was run, and `-` reads standard input. Each holds at most 64 MB.
 * Whatever a URL parser reads as an http:// or https:// address once
 * trimmed is one, however it is written, and is refused with a user or a
 * password in it as Studio refuses one.
 *
 * @param given - A URL, a file's path, or `-`
 * @param project - The project, whose config names the private hosts allowed
 * @param root - The project root
 * @param stdin - Where `-` reads from
 * @param auth - What a URL is fetched with; only a URL is
 * @returns The specification's text, how it was given, its URL and its auth
 * @throws {Error} When the file is missing, not a file or too large
 * @throws {SpecFetchError} When the URL is refused or cannot be fetched
 * @example
 * ```ts
 * const { raw, importType } = await readSpecInput("./openapi.json", project, root);
 * ```
 */
export async function readSpecInput(
  given: string,
  project: ProjectReads,
  root: string,
  stdin: AsyncIterable<Buffer | string> = process.stdin,
  auth?: CourierImportAuth,
): Promise<SpecInput> {
  const address = given === "-" ? undefined : addressOf(given);
  if (auth !== undefined && address === undefined) {
    throw new Error(
      "--bearer-env, --basic-env and --header-env are for a specification read from a URL",
    );
  }
  if (given === "-") return { raw: await readStream(stdin), importType: "raw" };
  if (address === undefined) {
    const path = resolve(given);
    return { raw: readSpecFile(path, shownPath(given, path)), importType: "file" };
  }
  /* Kept as written when written as an address is; any other spelling, as the parser reads it. */
  const url = URL_PATTERN.test(given.trim()) ? given.trim() : address.href;
  const headers = importAuthHeaders(auth);
  const raw = await fetchSpec(url, specHostAllowlist(project, root), { headers });
  return { raw, importType: "url", url, ...(auth !== undefined && { auth }) };
}
