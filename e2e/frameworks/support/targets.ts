import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The application templates the framework versions are built from. */
export type AppKind =
  | "next"
  | "sveltekit"
  | "nuxt"
  | "express"
  | "fastify"
  | "hono"
  | "astro"
  | "react-router"
  | "solid-start"
  | "spa";

/** A framework version the session is checked against, as an application installs it. */
export interface Target {
  /** How CI and the runner name it */
  readonly id: string;
  /** The template it is built from, under `apps/` */
  readonly app: AppKind;
  /** Templates laid over it, under `apps/`, in order */
  readonly overlays?: readonly string[];
  /** How it is built, where the version builds otherwise than its template does */
  readonly build?: readonly string[];
  /** Courier's packages it installs, packed as the registry would ship them */
  readonly packages: readonly string[];
  /** What it installs from npm, by name and range */
  readonly install: Readonly<Record<string, string>>;
}

/** Where the framework checks live: templates, targets and tests. */
export const FRAMEWORKS = join(import.meta.dirname, "..");

const KINDS: ReadonlySet<string> = new Set([
  "next",
  "sveltekit",
  "nuxt",
  "express",
  "fastify",
  "hono",
  "astro",
  "react-router",
  "solid-start",
  "spa",
]);

/**
 * Every framework version in the matrix, from `targets.json` — the list CI
 * builds its jobs from.
 *
 * @returns The targets
 * @example
 * ```ts
 * targets().map((target) => target.id); // ["next-14", …, "react-spa"]
 * ```
 */
export function targets(): Target[] {
  const parsed: unknown = JSON.parse(readFileSync(join(FRAMEWORKS, "targets.json"), "utf8"));
  if (!Array.isArray(parsed) || !parsed.every(isTarget)) {
    throw new Error("e2e/frameworks/targets.json does not list targets as Target describes them");
  }
  return parsed;
}

/**
 * The target a run checks, named by `COURIER_FRAMEWORK`.
 *
 * @param id - The target's id
 * @returns The target
 * @throws When no target has that id
 * @example
 * ```ts
 * targetOf(process.env.COURIER_FRAMEWORK).app; // "next"
 * ```
 */
export function targetOf(id: string | undefined): Target {
  const all = targets();
  const target = all.find((candidate) => candidate.id === id);
  if (target === undefined) {
    throw new Error(`Set COURIER_FRAMEWORK to one of: ${all.map((each) => each.id).join(", ")}`);
  }
  return target;
}

function isTarget(value: unknown): value is Target {
  if (typeof value !== "object" || value === null) return false;
  const { id, app, packages, install, overlays, build } = value as Record<string, unknown>;
  return (
    typeof id === "string" &&
    typeof app === "string" &&
    KINDS.has(app) &&
    isStrings(packages) &&
    (overlays === undefined || isStrings(overlays)) &&
    (build === undefined || isStrings(build)) &&
    typeof install === "object" &&
    install !== null &&
    Object.values(install).every((range) => typeof range === "string")
  );
}

function isStrings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === "string");
}
