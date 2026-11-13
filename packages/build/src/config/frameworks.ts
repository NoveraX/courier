/**
 * Which framework a project is built with, told by the packages its
 * package.json lists — the one rule Courier tells a framework by, for
 * reading a project's modules as its server does and for setting Courier
 * up in it.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { isRecord } from "../util/is-record";

/** The frameworks Courier tells apart. */
export type FrameworkId =
  | "next"
  | "nuxt"
  | "sveltekit"
  | "astro"
  | "react-router"
  | "remix"
  | "solid-start"
  | "expo"
  | "nestjs"
  | "fastify"
  | "hono"
  | "express"
  | "koa"
  | "hapi"
  | "elysia"
  | "h3"
  | "nitro"
  | "react"
  | "vue";

/** A framework, and the packages a project that uses it lists. */
export interface FrameworkMarker {
  readonly id: FrameworkId;
  /** The framework as its users name it. */
  readonly label: string;
  /** The package whose presence tells the framework, and whose version is the framework's. */
  readonly marker: string;
  /** Another package the project must list too. */
  readonly also?: string;
  /**
   * Whether the marker tells the framework first as a dependency the app
   * runs with: Courier's setup installs Hono for Studio's mock as a dev
   * dependency, in an app built with another framework. Listed only among
   * the dev dependencies, it still tells the framework where no other is
   * listed, as for a worker a bundler builds.
   */
  readonly runsWith?: boolean;
  /**
   * Whether it runs a server alone, which a package may list beside the
   * framework its page is built with: such a package is told by its
   * server, which comes before the page's in the list, and is not a
   * page's alone.
   */
  readonly server?: boolean;
}

/** The frameworks, the ones built on others first: a Next.js app lists React too; a server before a page Vite builds. */
export const FRAMEWORK_MARKERS: readonly FrameworkMarker[] = [
  { id: "next", label: "Next.js", marker: "next" },
  { id: "nuxt", label: "Nuxt", marker: "nuxt" },
  { id: "sveltekit", label: "SvelteKit", marker: "@sveltejs/kit" },
  { id: "astro", label: "Astro", marker: "astro" },
  { id: "react-router", label: "React Router", marker: "@react-router/dev" },
  { id: "remix", label: "Remix", marker: "@remix-run/dev" },
  { id: "solid-start", label: "SolidStart", marker: "@solidjs/start" },
  { id: "expo", label: "Expo", marker: "expo" },
  { id: "nestjs", label: "NestJS", marker: "@nestjs/core", server: true },
  { id: "fastify", label: "Fastify", marker: "fastify", server: true },
  { id: "hono", label: "Hono", marker: "hono", runsWith: true, server: true },
  { id: "express", label: "Express", marker: "express", server: true },
  { id: "koa", label: "Koa", marker: "koa", server: true },
  { id: "hapi", label: "hapi", marker: "@hapi/hapi", server: true },
  { id: "elysia", label: "Elysia", marker: "elysia", server: true },
  { id: "h3", label: "h3", marker: "h3", server: true },
  { id: "nitro", label: "Nitro", marker: "nitro", server: true },
  { id: "react", label: "React with Vite", marker: "vite", also: "react" },
  { id: "vue", label: "Vue with Vite", marker: "vite", also: "vue" },
];

/** The packages a package.json lists, by the field it lists them in. */
export interface ListedPackages {
  readonly dependencies: Readonly<Record<string, unknown>>;
  readonly devDependencies: Readonly<Record<string, unknown>>;
  readonly peerDependencies: Readonly<Record<string, unknown>>;
  readonly optionalDependencies: Readonly<Record<string, unknown>>;
}

/** The framework a project is built with, and the package.json that says so. */
export interface ProjectFramework {
  /** The framework, or `undefined` when the package.json lists none Courier tells. */
  readonly framework: FrameworkMarker | undefined;
  /** The package.json read, absolute; `undefined` when there is none up to the root of the disk. */
  readonly manifest: string | undefined;
}

/**
 * The framework a project is built with, told by the packages it lists: a
 * framework told first by what the app runs with counts among the dev
 * dependencies only where no other framework is listed.
 *
 * @param listed - The packages the project's package.json lists
 * @returns The framework, or `undefined` when it lists none Courier tells
 * @example
 * ```ts
 * detectFramework({ dependencies: { next: "^16.0.0", react: "^19.0.0" }, … })?.label; // "Next.js"
 * ```
 */
export function detectFramework(listed: ListedPackages): FrameworkMarker | undefined {
  const lists = (name: string): boolean =>
    [
      listed.dependencies,
      listed.devDependencies,
      listed.peerDependencies,
      listed.optionalDependencies,
    ].some((field) => Object.hasOwn(field, name));
  const told = (framework: FrameworkMarker, marked: boolean): boolean =>
    marked && (framework.also === undefined || lists(framework.also));
  return (
    FRAMEWORK_MARKERS.find((framework) =>
      told(
        framework,
        framework.runsWith === true
          ? Object.hasOwn(listed.dependencies, framework.marker)
          : lists(framework.marker),
      ),
    ) ??
    FRAMEWORK_MARKERS.find((framework) =>
      told(framework, framework.runsWith === true && lists(framework.marker)),
    )
  );
}

/**
 * The framework of the project a folder belongs to, told by the nearest
 * package.json at or above it. A package.json that does not parse lists
 * nothing: the project is then read as plain Node, as it would be with none.
 *
 * @param folder - A folder of the project, absolute: the config's own
 * @returns The framework, and the package.json that told it
 * @example
 * ```ts
 * projectFramework("/app").framework?.id; // "sveltekit", where /app/package.json lists @sveltejs/kit
 * ```
 */
export function projectFramework(folder: string): ProjectFramework {
  const manifest = nearestManifest(folder);
  if (manifest === undefined) return { framework: undefined, manifest };
  return { framework: detectFramework(listedIn(manifest)), manifest };
}

function nearestManifest(folder: string): string | undefined {
  for (let current = folder; ; current = dirname(current)) {
    const candidate = join(current, "package.json");
    if (existsSync(candidate)) return candidate;
    if (dirname(current) === current) return undefined;
  }
}

function listedIn(manifest: string): ListedPackages {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifest, "utf8"));
  } catch {
    /* A package.json being written, or not JSON at all, names no package; the next read sees it whole. */
    parsed = undefined;
  }
  const field = (name: string): Readonly<Record<string, unknown>> => {
    const value = isRecord(parsed) ? parsed[name] : undefined;
    return isRecord(value) ? value : {};
  };
  return {
    dependencies: field("dependencies"),
    devDependencies: field("devDependencies"),
    peerDependencies: field("peerDependencies"),
    optionalDependencies: field("optionalDependencies"),
  };
}
