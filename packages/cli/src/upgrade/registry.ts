import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type PackageManager,
  runTool,
  SetupRefusal,
  toolFailure,
} from "@noverax/create-courier/engine";

import { isRecord } from "../util/is-record";
import { UPGRADE_LIMITS } from "./limits";

/** A package as the registry publishes it at a release. */
export interface Published {
  readonly version: string;
  /** The Node.js its `engines` asks for, where it asks. */
  readonly node: string | undefined;
}

/** Where an upgrade asks what the registry publishes. */
export interface Registry {
  /**
   * What is published of a package at a version or a tag.
   *
   * @param spec - `@noverax/courier@latest`, `@noverax/courier-react@0.5.0`
   * @returns What is published, or `undefined` where nothing such is
   * @throws {SetupRefusal} `REGISTRY_UNREACHABLE` when the registry does not answer
   */
  published(spec: string): Promise<Published | undefined>;
}

/* What a package manager answers for a version, or a package, that is not there. */
const MISSING = /\bE404\b|\bETARGET\b|\b404\b|No matching version|No candidates found/i;

/**
 * The command that asks the registry of a package, through the package
 * manager the person installs with, so their registry, proxy and
 * credentials hold: Yarn from 2 on reads its registry from .yarnrc.yml,
 * which npm does not; the others read .npmrc, as npm does.
 *
 * @param root - The workspace's folder
 * @param manager - The package manager
 * @param spec - The package, at a version or a tag
 * @returns The command
 * @example
 * ```ts
 * viewCommand(root, manager, "@noverax/courier@latest"); // ["npm", "view", "@noverax/courier@latest", "version", "engines", "--json"]
 * ```
 */
export function viewCommand(root: string, manager: PackageManager, spec: string): string[] {
  if (manager.name === "yarn" && existsSync(join(root, ".yarnrc.yml")))
    return ["yarn", "npm", "info", spec, "--fields", "version,engines", "--json"];
  return ["npm", "view", spec, "version", "engines", "--json"];
}

/**
 * What a view command's answer says is published: its JSON, an object —
 * or a list of them, where a range names several versions, the last
 * latest — whose version and engines are read.
 *
 * @param answer - What it wrote to standard output
 * @returns What is published, or `undefined` where the answer names no version
 * @example
 * ```ts
 * readPublished('{ "version": "0.5.0", "engines": { "node": ">=22" } }'); // { version: "0.5.0", node: ">=22" }
 * ```
 */
export function readPublished(answer: string): Published | undefined {
  let json: unknown;
  try {
    json = JSON.parse(answer);
  } catch {
    /* An answer that is no JSON names no version. */
    return undefined;
  }
  const value = Array.isArray(json) ? json.at(-1) : json;
  if (!isRecord(value) || typeof value.version !== "string") return undefined;
  const engines = isRecord(value.engines) ? value.engines : {};
  return {
    version: value.version,
    node: typeof engines.node === "string" ? engines.node : undefined,
  };
}

/**
 * Whether what a view command wrote to standard error, as it failed, says
 * the package or the version is not there — rather than that the registry
 * did not answer.
 *
 * @param said - What it wrote
 * @returns Whether nothing such is published
 * @example
 * ```ts
 * saysMissing("npm error code E404"); // true
 * ```
 */
export function saysMissing(said: string): boolean {
  return MISSING.test(said);
}

/**
 * The registry, as the person's package manager reaches it from the
 * workspace: each question asked within its time.
 *
 * @param root - The workspace's folder
 * @param manager - The package manager the person installs with
 * @returns The registry
 * @example
 * ```ts
 * await managerRegistry(root, manager).published("@noverax/courier@latest"); // { version: "0.5.0", node: ">=22" }
 * ```
 */
export function managerRegistry(root: string, manager: PackageManager): Registry {
  return {
    async published(spec) {
      const command = viewCommand(root, manager, spec);
      const answer: string[] = [];
      const said: string[] = [];
      const result = await runTool(command, {
        cwd: root,
        output: {
          kind: "lines",
          line: (line, stream) => (stream === "stdout" ? answer : said).push(line),
        },
        deadlineMs: UPGRADE_LIMITS.registryMs,
      });
      if (result.status === 0 && result.stopped === undefined)
        return readPublished(answer.join("\n"));
      if (result.stopped === undefined && saysMissing(said.join("\n"))) return undefined;
      throw new SetupRefusal(
        "REGISTRY_UNREACHABLE",
        `The registry did not say what ${spec} is: ${toolFailure(command, result, UPGRADE_LIMITS.registryMs)}`,
      );
    },
  };
}

/**
 * What the registry publishes of each of several packages at one version,
 * asked a few at a time.
 *
 * @param registry - The registry
 * @param names - The packages
 * @param version - The version
 * @returns Each package's, by name; `undefined` for one published at no such version
 * @throws {SetupRefusal} `REGISTRY_UNREACHABLE` when the registry does not answer
 * @example
 * ```ts
 * await publishedAt(registry, ["@noverax/courier", "@noverax/courier-next"], "0.5.0");
 * ```
 */
export async function publishedAt(
  registry: Registry,
  names: readonly string[],
  version: string,
): Promise<Map<string, Published | undefined>> {
  const found = new Map<string, Published | undefined>();
  const queue = [...names];
  const ask = async () => {
    for (let name = queue.shift(); name !== undefined; name = queue.shift())
      found.set(name, await registry.published(`${name}@${version}`));
  };
  await Promise.all(Array.from({ length: UPGRADE_LIMITS.registryConcurrency }, ask));
  return found;
}
