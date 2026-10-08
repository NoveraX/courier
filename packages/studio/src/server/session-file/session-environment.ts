import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { toOpenAPI } from "@noverax/courier/openapi";

import { studioVersion } from "../studio-version";

/** What a session ran on: the tools, the packages, and the API it was made against. */
export interface SessionEnvironment {
  readonly studio: string;
  /** Absent when Studio serves a public demo, whose machine is its host's business. */
  readonly node?: string | undefined;
  /** Absent when Studio serves a public demo. */
  readonly platform?: string | undefined;
  /** The installed version of each package the project depends on that bears on its requests. */
  readonly packages: Readonly<Record<string, string>>;
  /** Each source's definition as a fingerprint: the same definition, the same hash. */
  readonly definitions: Readonly<Record<string, string>>;
}

/* What decides how a request is made and answered: Courier's packages, the frameworks, the schemas. */
const WATCHED =
  /^(@noverax\/|next$|nuxt$|react$|react-native$|expo$|hono$|express$|fastify$|@nestjs\/core$|zod$|valibot$|arktype$|@tanstack\/react-query$)/;

/**
 * The environment a session was recorded in, for whoever opens it later:
 * Studio's and Node's versions, the platform, the installed version of each
 * package that bears on a request, and a fingerprint of each source's
 * definition — its OpenAPI document, hashed — so a colleague can tell the
 * same API from a changed one.
 *
 * A public demo names no Node.js version or platform: those describe the
 * machine serving it, which is its host's business, not its visitors'.
 *
 * @param root - The project root
 * @param sources - The sources Studio runs, by name
 * @param options - Whether the machine Studio runs on is named (`host`, default `true`)
 * @returns The environment
 * @example
 * ```ts
 * sessionEnvironment(root, project.snapshot().running?.config.sources ?? {});
 * ```
 */
export function sessionEnvironment(
  root: string,
  sources: Readonly<Record<string, unknown>>,
  { host = true }: { host?: boolean } = {},
): SessionEnvironment {
  return {
    studio: studioVersion(),
    ...(host && { node: process.version, platform: `${process.platform}-${process.arch}` }),
    packages: installedPackages(root),
    definitions: Object.fromEntries(
      Object.entries(sources).map(([name, source]) => [name, fingerprintOf(source)]),
    ),
  };
}

/**
 * The environment a session file says it was recorded in, read as untrusted
 * input: each part a string, as Studio writes it, cut to a sane length;
 * anything else in the file is left behind.
 *
 * @param value - The file's `environment`
 * @returns The environment, or `undefined` when the file holds none
 * @example
 * ```ts
 * readEnvironment(JSON.parse(text).environment)?.studio;
 * ```
 */
export function readEnvironment(value: unknown): SessionEnvironment | undefined {
  const read = asRecord(value);
  if (!read) return undefined;
  const node = optionalText(read.node);
  const platform = optionalText(read.platform);
  return {
    studio: optionalText(read.studio) ?? "unknown",
    ...(node !== undefined && { node }),
    ...(platform !== undefined && { platform }),
    packages: stringsOf(read.packages),
    definitions: stringsOf(read.definitions),
  };
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" ? value.slice(0, 200) : undefined;
}

function stringsOf(value: unknown): Record<string, string> {
  const entries = Object.entries(asRecord(value) ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .slice(0, 200)
    .map(([name, text]): [string, string] => [name.slice(0, 200), text.slice(0, 200)]);
  return Object.fromEntries(entries);
}

function installedPackages(root: string): Record<string, string> {
  const manifest = readJson(join(root, "package.json"));
  const named = Object.keys({
    ...asRecord(manifest?.dependencies),
    ...asRecord(manifest?.devDependencies),
  });
  const require = createRequire(join(root, "package.json"));
  const found: Record<string, string> = {};
  for (const name of named.filter((candidate) => WATCHED.test(candidate)).sort()) {
    found[name] = resolvedVersion(require, name) ?? installedVersion(root, name);
  }
  return found;
}

function resolvedVersion(require: NodeJS.Require, name: string): string | undefined {
  try {
    const version = readJson(require.resolve(`${name}/package.json`))?.version;
    return typeof version === "string" ? version : undefined;
  } catch {
    /* Its exports hide the manifest, as Hono's do: read from node_modules instead. */
    return undefined;
  }
}

/* As Node looks for a package: in `node_modules`, from the project upward. */
function installedVersion(root: string, name: string): string {
  for (let dir = root; ; dir = dirname(dir)) {
    const version = readJson(join(dir, "node_modules", name, "package.json"))?.version;
    if (typeof version === "string") return version;
    if (dirname(dir) === dir) return "not installed";
  }
}

function fingerprintOf(source: unknown): string {
  if (typeof source !== "object" || source === null) return "unreadable";
  try {
    const document = JSON.stringify(toOpenAPI(source, { openapi: "3.2.0" }));
    return `sha256:${createHash("sha256").update(document).digest("hex").slice(0, 16)}`;
  } catch {
    /* A source no document can be written for still names itself; its fingerprint says why not. */
    return "unreadable";
  }
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
