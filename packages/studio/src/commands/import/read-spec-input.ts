import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { CourierImportType } from "@noverax/courier/config";

import { fetchSpec } from "../../server/fetch-spec";
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
}

const MB = 1024 * 1024;
const URL_PATTERN = /^https?:\/\//i;

function withoutMark(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function readSpecFile(path: string): string {
  const stats = statSync(path, { throwIfNoEntry: false });
  if (stats === undefined) throw new Error(`There is no file at ${path}`);
  if (!stats.isFile()) throw new Error(`${path} is not a file`);
  if (stats.size > SPEC_MAX_BYTES) {
    throw new Error(`${path} is larger than ${SPEC_MAX_BYTES / MB} MB`);
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
 *
 * @param given - A URL, a file's path, or `-`
 * @param project - The project, whose config names the private hosts allowed
 * @param root - The project root
 * @param stdin - Where `-` reads from
 * @returns The specification's text, how it was given and its URL
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
): Promise<SpecInput> {
  if (given === "-") return { raw: await readStream(stdin), importType: "raw" };
  if (!URL_PATTERN.test(given)) return { raw: readSpecFile(resolve(given)), importType: "file" };
  const raw = await fetchSpec(given, specHostAllowlist(project, root));
  return { raw, importType: "url", url: given };
}
