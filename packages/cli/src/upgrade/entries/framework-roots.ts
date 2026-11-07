import type { FrameworkId, ServerId } from "@noverax/create-courier/engine";

import type { PieceKind } from "../codemod/source-files";
import { byPath } from "./path-rules";
import { NONE, PAGE, SERVER, SPLIT } from "./root-kinds";
import { isToolConfig } from "./tool-configs";

/** A framework a package's code runs on, as the upgrade tells it: one the setup knows, a server it tells beside a page, or `vite`, a page Vite builds beside a server whose framework no list knows. */
export type PackageFrameworkId = FrameworkId | ServerId | "vite";

/** A file-level directive a framework reads: a module of the page's, or one of server functions. */
export type Directive = "use client" | "use server";

/** What a framework's rules read of a piece of code. */
export interface PieceFacts {
  /** Its file, relative to the root of the package it is in, `/`-separated. */
  readonly path: string;
  readonly kind: PieceKind;
  /** The directive its file opens with, where it opens with one. */
  readonly directive: Directive | undefined;
  /** Whether it exports a default: a route module's component. */
  readonly exportsDefault: boolean;
  /** The names it exports, `*` for an `export *`; `undefined` where they are not read. */
  readonly exports?: readonly string[] | undefined;
}

/** What a framework's own rules say of a piece: a page's bundle starts from it, the server's code does, or the framework splits it between the two. */
export interface PieceRoots {
  readonly page: boolean;
  readonly server: boolean;
  readonly split: boolean;
}

/** A package's framework, and what its own files say of its routes: React Router's routes file. */
export interface PackageFramework {
  readonly id: PackageFrameworkId | undefined;
  /** The route modules React Router's routes file names, relative to `app/` and without extension; `undefined` where it reads the folder. */
  readonly routeModules?: ReadonlySet<string> | undefined;
  /** Expo Router's folder of routes, relative to the package's root: `app` where none is given. */
  readonly routes?: string | undefined;
  /** The file package.json's `main` names, without its extension: where an app starts. */
  readonly main?: string | undefined;
  /** Whether a server framework runs beside the page's — Express, Koa and the rest — so what no page's file reaches is the server's. */
  readonly withServer?: boolean | undefined;
  /** The modules a page Vite builds beside such a server starts from: its HTML's module scripts, or its config's input; none where neither is read, so no file of the package takes a side. */
  readonly pageEntries?: ReadonlySet<string> | undefined;
}

const NEXT_SPECIAL =
  /^(?:src\/)?app\/(?:.*\/)?(?:page|layout|template|default|loading|not-found|global-error|route|opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest)\.[cm]?[jt]sx?$/;
const NEXT_SERVER = /^(?:src\/)?(?:middleware|proxy|instrumentation)\.[cm]?[jt]sx?$/;
const NEXT_CLIENT = /^(?:src\/)?instrumentation-client\.[cm]?[jt]sx?$/;
const NEXT_PAGES = /^(?:src\/)?pages\//;
const NEXT_PAGES_SERVER = /^(?:src\/)?pages\/(?:api\/|_document\.)/;
const ASTRO_SERVER = /^src\/(?:pages\/.+\.[cm]?[jt]s$|middleware(?:\.|\/)|actions\/)/;
const ASTRO_ISLAND = /^src\/.+\.(?:jsx|tsx|vue|svelte)$/;
const ROUTE_APP = /^app\/(?:entry\.(server|client)|root)\.[cm]?[jt]sx?$/;
const COMPONENT = /\.(?:astro|[jt]sx|vue|svelte)$/;
/* The frameworks that hand a page a reference to each function of a module of server functions. */
const SERVER_FUNCTIONS: ReadonlySet<PackageFrameworkId> = new Set(["next", "solid-start"]);
/* React Router's and Remix's server modules and client modules: by their names, `*.server.*`, or in a folder of the name, `.server/`. */
const SERVER_MODULE = /(?:^|\/)(?:[^/]+\.server\.[^/]+$|\.server\/)/;
const CLIENT_MODULE = /(?:^|\/)(?:[^/]+\.client\.[^/]+$|\.client\/)/;
const MODULE_RULES: ReadonlySet<PackageFrameworkId> = new Set(["react-router", "remix"]);

function next(facts: PieceFacts): PieceRoots {
  if (facts.directive === "use client" || NEXT_CLIENT.test(facts.path)) return PAGE;
  if (facts.directive === "use server") return SERVER;
  if ([NEXT_SPECIAL, NEXT_SERVER, NEXT_PAGES_SERVER].some((rule) => rule.test(facts.path)))
    return SERVER;
  return NEXT_PAGES.test(facts.path) ? SPLIT : NONE;
}

/* A route module of React Router's or Remix's: under app/routes, or one React Router's routes file names. */
function isRouteModule(framework: PackageFramework, path: string): boolean {
  if (!path.startsWith("app/")) return false;
  const named = path.slice("app/".length).replace(/\.[^./]+$/, "");
  return path.startsWith("app/routes/") || framework.routeModules?.has(named) === true;
}

function reactRouter(framework: PackageFramework, facts: PieceFacts): PieceRoots {
  if (SERVER_MODULE.test(facts.path)) return SERVER;
  if (CLIENT_MODULE.test(facts.path)) return PAGE;
  const entry = ROUTE_APP.exec(facts.path);
  if (entry?.[1] === "server") return SERVER;
  if (entry?.[1] === "client") return PAGE;
  if (entry !== null || isRouteModule(framework, facts.path))
    return facts.exportsDefault ? SPLIT : SERVER;
  return /^server(?:\.|\/)/.test(facts.path) ? SERVER : NONE;
}

function astro(facts: PieceFacts): PieceRoots {
  if (facts.kind === "frontmatter") return SERVER;
  if (facts.kind === "script" && facts.path.endsWith(".astro")) return PAGE;
  if (ASTRO_SERVER.test(facts.path)) return SERVER;
  return ASTRO_ISLAND.test(facts.path) ? PAGE : NONE;
}

/**
 * What a package's framework says of a piece of its code, by its rules
 * alone: whether a page's bundle starts from it — Next.js's `"use client"`,
 * Nuxt's pages and components, SvelteKit's routes and `src/lib`, an Astro
 * file's scripts, an SPA's `src/`, or the entries of a page built with
 * Vite beside a server — whether the server's code does — a route
 * handler, `*.server.*` and `.server/`, `server/`, middleware, instrumentation, an API
 * route, every file of Express, Fastify, Hono and NestJS — or whether
 * the framework splits it between the two, as a route module with its
 * loader and its component. A directive counts only where the framework
 * reads it. A framework the upgrade does not know says nothing.
 *
 * @param framework - The package's framework
 * @param facts - The piece
 * @returns Its roots
 * @example
 * ```ts
 * rootsOf({ id: "next" }, { path: "app/api/users/route.ts", kind: "module", directive: undefined, exportsDefault: false }).server; // true
 * ```
 */
export function rootsOf(framework: PackageFramework, facts: PieceFacts): PieceRoots {
  if (isToolConfig(facts.path)) return NONE;
  switch (framework.id) {
    case undefined:
      return NONE;
    case "next":
      return next(facts);
    case "react-router":
    case "remix":
      return reactRouter(framework, facts);
    case "astro":
      return astro(facts);
    default:
      return byPath(framework, facts);
  }
}

/**
 * Whether the server only renders a file a piece imports, rather than
 * running its code as the server's: a Next.js client component a server
 * component imports, and a component an Astro page's frontmatter takes
 * the default of alone — a named import or a namespace of its module
 * runs that code in the frontmatter. Rendered, its code runs as a page's,
 * with what the server's adapter gave the process.
 *
 * @param framework - The importing piece's framework
 * @param from - The importing piece
 * @param to - The imported file: where it is, the directive it opens with, and whether every import of it takes its default alone
 * @returns Whether the import carries no running of the server's
 * @example
 * ```ts
 * rendersOnly("next", serverComponent, { path: "app/panel.tsx", directive: "use client", defaultAlone: false }); // true
 * ```
 */
export function rendersOnly(
  framework: PackageFrameworkId | undefined,
  from: PieceFacts,
  to: {
    readonly path: string;
    readonly directive: Directive | undefined;
    readonly defaultAlone: boolean;
  },
): boolean {
  if (framework === "next") return to.directive === "use client";
  return (
    framework === "astro" &&
    from.kind === "frontmatter" &&
    to.defaultAlone &&
    COMPONENT.test(to.path)
  );
}

/**
 * Whether a page that imports a file takes none of its code: a module of
 * server functions, `"use server"`, under a framework that reads the
 * directive — Next.js and SolidStart give the page a reference to each of
 * its functions, which the server runs when the page calls it.
 *
 * @param framework - The importing piece's framework
 * @param to - The imported file: the directive it opens with
 * @returns Whether the import carries none of the file's code to the page
 * @example
 * ```ts
 * takesReferencesOnly("next", { directive: "use server" }); // true
 * ```
 */
export function takesReferencesOnly(
  framework: PackageFrameworkId | undefined,
  to: { readonly directive: Directive | undefined | "unknown" },
): boolean {
  return (
    framework !== undefined && SERVER_FUNCTIONS.has(framework) && to.directive === "use server"
  );
}

/**
 * Whether a framework's build keeps a file out of one side's code by its
 * name: React Router and Remix leave a server module — `*.server.*`, or
 * one in a `.server/` folder — out of a page's bundle, and fail a build
 * whose page would take one, and a client module out of the server's.
 *
 * @param framework - The framework of the piece that imports it
 * @param side - The side whose code it would be
 * @param path - The file, as its package names it
 * @returns Whether that side never takes the file
 * @example
 * ```ts
 * keptOut("react-router", "page", "app/.server/caller.ts"); // true
 * ```
 */
export function keptOut(
  framework: PackageFrameworkId | undefined,
  side: "page" | "server",
  path: string,
): boolean {
  if (framework === undefined || !MODULE_RULES.has(framework)) return false;
  return (side === "page" ? SERVER_MODULE : CLIENT_MODULE).test(path);
}
