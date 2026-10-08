import { isPlainObject } from "@/socket/is-plain-object";

/** What a session was recorded on: the tools, the packages, and a fingerprint of each API. */
export interface SessionEnvironment {
  studio: string;
  /** Absent when a public demo recorded it: its machine is its host's business. */
  node?: string | undefined;
  platform?: string | undefined;
  /** The installed version of each package that bears on a request. */
  packages: Readonly<Record<string, string>>;
  /** Each source's definition as a fingerprint: the same definition, the same hash. */
  definitions: Readonly<Record<string, string>>;
}

/** One line of an environment, and what the other side has there when it differs. */
export interface EnvironmentLine {
  group: "Runtime" | "Packages" | "Definitions";
  name: string;
  value: string;
  /** What the environment it is compared with has instead; absent when they agree. */
  other?: string | undefined;
}

/**
 * Read the environment Studio sent: each part a string, as Studio writes it.
 *
 * @param value - What Studio sent
 * @returns The environment, or `undefined` for anything else
 * @example
 * ```ts
 * environmentOf(await post("/api/sessions/environment"));
 * ```
 */
export function environmentOf(value: unknown): SessionEnvironment | undefined {
  if (!isPlainObject(value) || typeof value.studio !== "string") return undefined;
  const { node, platform } = value;
  return {
    studio: value.studio,
    ...(typeof node === "string" && { node }),
    ...(typeof platform === "string" && { platform }),
    packages: stringsOf(value.packages),
    definitions: stringsOf(value.definitions),
  };
}

/**
 * An environment line by line — the runtime, each package, each source's
 * definition — each line set beside the other environment's, when one is
 * given: what it lacks reads `not a dependency`, or `no such source`. A
 * line the environment does not name — a public demo's Node.js and
 * platform — reads `not named`, and is set beside nothing.
 *
 * @param environment - The environment shown
 * @param other - The one it is compared with, such as this Studio's own
 * @returns The lines, in order
 * @example
 * ```ts
 * environmentLines(recorded, mine).filter((line) => line.other !== undefined); // what differs
 * ```
 */
export function environmentLines(
  environment: SessionEnvironment,
  other?: SessionEnvironment,
): EnvironmentLine[] {
  const line = (
    group: EnvironmentLine["group"],
    name: string,
    value: string | undefined,
    theirs: string | undefined,
  ): EnvironmentLine => ({
    group,
    name,
    value: value ?? "not named",
    ...(other && value !== undefined && theirs !== value && { other: theirs ?? "not named" }),
  });
  return [
    line("Runtime", "Studio", environment.studio, other?.studio),
    line("Runtime", "Node.js", environment.node, other?.node),
    line("Runtime", "Platform", environment.platform, other?.platform),
    ...Object.entries(environment.packages).map(([name, version]) =>
      line(
        "Packages",
        name,
        version,
        other ? (other.packages[name] ?? "not a dependency") : undefined,
      ),
    ),
    ...Object.entries(environment.definitions).map(([name, hash]) =>
      line(
        "Definitions",
        name,
        hash,
        other ? (other.definitions[name] ?? "no such source") : undefined,
      ),
    ),
  ];
}

function stringsOf(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
