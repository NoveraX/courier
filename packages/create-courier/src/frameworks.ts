import type { Project } from "./project/read-project";
import { astroRecipe } from "./recipes/astro";
import { expoRecipe } from "./recipes/expo";
import { expressRecipe } from "./recipes/express";
import { fastifyRecipe } from "./recipes/fastify";
import { honoRecipe } from "./recipes/hono";
import { nestRecipe } from "./recipes/nestjs";
import { nextRecipe } from "./recipes/next";
import { nuxtRecipe } from "./recipes/nuxt";
import { reactRouterRecipe } from "./recipes/react-router";
import { reactViteRecipe } from "./recipes/react-vite";
import type { Recipe, RecipeContext } from "./recipes/recipe-types";
import { solidStartRecipe } from "./recipes/solid-start";
import { svelteKitRecipe } from "./recipes/sveltekit";
import { tanstackStartReactRecipe, tanstackStartSolidRecipe } from "./recipes/tanstack-start";
import { vueViteRecipe } from "./recipes/vue-vite";

/** The frameworks the command sets Courier up in. */
export type FrameworkId =
  | "next"
  | "nuxt"
  | "sveltekit"
  | "astro"
  | "react-router"
  | "remix"
  | "solid-start"
  | "tanstack-start-react"
  | "tanstack-start-solid"
  | "expo"
  | "nestjs"
  | "fastify"
  | "hono"
  | "express"
  | "react"
  | "vue";

/** A framework, how the command tells a project uses it, and its recipe. */
export interface Framework {
  readonly id: FrameworkId;
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
  readonly recipe?: (ctx: RecipeContext) => Recipe;
}

/** The frameworks, the ones built on others first: a Next.js app lists React too. */
export const FRAMEWORKS: readonly Framework[] = [
  { id: "next", label: "Next.js", marker: "next", recipe: nextRecipe },
  { id: "nuxt", label: "Nuxt", marker: "nuxt", recipe: nuxtRecipe },
  { id: "sveltekit", label: "SvelteKit", marker: "@sveltejs/kit", recipe: svelteKitRecipe },
  { id: "astro", label: "Astro", marker: "astro", recipe: astroRecipe },
  {
    id: "react-router",
    label: "React Router",
    marker: "@react-router/dev",
    recipe: reactRouterRecipe,
  },
  { id: "remix", label: "Remix", marker: "@remix-run/dev", recipe: reactRouterRecipe },
  { id: "solid-start", label: "SolidStart", marker: "@solidjs/start", recipe: solidStartRecipe },
  {
    id: "tanstack-start-react",
    label: "TanStack Start for React",
    marker: "@tanstack/react-start",
    recipe: tanstackStartReactRecipe,
  },
  {
    id: "tanstack-start-solid",
    label: "TanStack Start for Solid",
    marker: "@tanstack/solid-start",
    recipe: tanstackStartSolidRecipe,
  },
  { id: "expo", label: "Expo", marker: "expo", recipe: expoRecipe },
  { id: "nestjs", label: "NestJS", marker: "@nestjs/core", recipe: nestRecipe },
  { id: "fastify", label: "Fastify", marker: "fastify", recipe: fastifyRecipe },
  { id: "hono", label: "Hono", marker: "hono", runsWith: true, recipe: honoRecipe },
  { id: "express", label: "Express", marker: "express", recipe: expressRecipe },
  { id: "react", label: "React with Vite", marker: "vite", also: "react", recipe: reactViteRecipe },
  { id: "vue", label: "Vue with Vite", marker: "vite", also: "vue", recipe: vueViteRecipe },
];

/** A framework that runs a server alone: one the command sets Courier up in, or one only the upgrade tells. */
export type ServerId =
  | "nestjs"
  | "fastify"
  | "hono"
  | "express"
  | "koa"
  | "hapi"
  | "elysia"
  | "h3"
  | "nitro";

/** A server framework a package may list beside the one its page is built with, or alone. */
export interface ServerFramework {
  readonly id: ServerId;
  readonly label: string;
  /** The package whose presence tells the framework. */
  readonly marker: string;
  /** Whether the marker tells it first as a dependency the app runs with, as {@link Framework} reads it. */
  readonly runsWith?: boolean;
  /** The page frameworks that run on it themselves, by the package that tells each, whether the command sets Courier up in one or not: beside one of them it is that framework's server, not one of its own. */
  readonly serves?: readonly string[];
  /** Whether it is built to be the server a page's framework runs on, as h3 and Nitro are: beside a page Vite builds whose framework the command does not know, it is that framework's. */
  readonly frameworkServer?: boolean;
}

/* A server framework the command sets Courier up in, as its list writes it. */
function setUpServer(id: Extract<ServerId, FrameworkId>): ServerFramework {
  const { label, marker, runsWith } = frameworkById(id);
  return { id, label, marker, ...(runsWith === undefined ? {} : { runsWith }) };
}

/* The page frameworks that run on h3 and Nitro themselves, by the package that tells each: Nuxt, SolidStart, TanStack Start where it is hosted with Nitro, and Analog, whose server routes Nitro and h3 run. */
const TANSTACK_START = ["@tanstack/react-start", "@tanstack/solid-start"];
const ON_H3 = ["nuxt", "@solidjs/start", "@analogjs/platform", ...TANSTACK_START];

/**
 * The frameworks that run a server alone, which a package may list
 * beside the one its page is built with: those the command sets Courier
 * up in, and those the upgrade tells a package's sides by besides —
 * Koa, hapi and Elysia, and h3 and Nitro, built to be the server of a
 * page's framework: Nuxt's, SolidStart's, Analog's. Studio tells a
 * package by the same servers, from `@noverax/courier-build`'s list.
 */
export const SERVER_FRAMEWORKS: readonly ServerFramework[] = [
  setUpServer("nestjs"),
  setUpServer("fastify"),
  setUpServer("hono"),
  setUpServer("express"),
  { id: "koa", label: "Koa", marker: "koa" },
  { id: "hapi", label: "hapi", marker: "@hapi/hapi" },
  { id: "elysia", label: "Elysia", marker: "elysia" },
  { id: "h3", label: "h3", marker: "h3", serves: ON_H3, frameworkServer: true },
  { id: "nitro", label: "Nitro", marker: "nitro", serves: ON_H3, frameworkServer: true },
];
const SERVER_IDS: ReadonlySet<string> = new Set(SERVER_FRAMEWORKS.map(({ id }) => id));

/* Whether a project lists a framework: its marker — one told first by what the app runs with among the dependencies, unless `alone` reads the dev dependencies for it too — and the package it also needs. */
function lists(
  project: Project,
  framework: Pick<Framework, "marker" | "also" | "runsWith">,
  alone: boolean,
): boolean {
  const marked =
    framework.runsWith === true && !alone
      ? project.manifest.dependencies[framework.marker] !== undefined
      : project.lists(framework.marker);
  return marked && (framework.also === undefined || project.lists(framework.also));
}

/* Whether a server framework a project lists is its page's framework's own: one that framework runs on, by the package that tells it, or one built to be a framework's server, beside a page Vite builds whose framework the command does not know. */
function servesPage(project: Project, server: ServerFramework, page: Framework | undefined) {
  if (server.serves?.some((marker) => project.lists(marker)) === true) return true;
  return server.frameworkServer === true && page === undefined && project.lists("vite");
}

/**
 * The framework a project is built with, told by the packages it lists: a
 * framework told first by what the app runs with counts among the dev
 * dependencies only where no other framework is listed.
 *
 * @param project - The project
 * @returns The framework, or `undefined` when it lists none the command knows
 * @example
 * ```ts
 * detectFramework(readProject("/work/shop"))?.label; // "Next.js"
 * ```
 */
export function detectFramework(project: Project): Framework | undefined {
  return (
    FRAMEWORKS.find((framework) => lists(project, framework, false)) ??
    FRAMEWORKS.find((framework) => framework.runsWith === true && lists(project, framework, true))
  );
}

/**
 * Every framework a project's code runs on: the one its page is built
 * with — a framework built on others before them, as
 * {@link detectFramework} tells it — and each server framework of
 * {@link SERVER_FRAMEWORKS} it lists beside, as a page built with Vite
 * and the Express or Koa server that serves it, but the one its page's
 * framework runs on itself — h3 or Nitro beside a page Vite builds whose
 * framework the command does not know, as Analog's, among them: the
 * project's code then runs on a framework no list knows, and none is
 * told. Where it lists neither, the one {@link detectFramework} tells.
 *
 * @param project - The project
 * @returns The frameworks, the page's first; none where it lists none the command knows
 * @example
 * ```ts
 * detectFrameworks(readProject("/work/shop")).map(({ id }) => id); // ["react", "express"]
 * ```
 */
export function detectFrameworks(project: Project): Array<Framework | ServerFramework> {
  const page = FRAMEWORKS.find(
    (framework) => !SERVER_IDS.has(framework.id) && lists(project, framework, false),
  );
  const servers = SERVER_FRAMEWORKS.filter(
    (server) => lists(project, server, false) && !servesPage(project, server, page),
  );
  const found = page === undefined ? servers : [page, ...servers];
  const alone = detectFramework(project);
  return found.length > 0 || alone === undefined ? found : [alone];
}

/**
 * The framework a `--framework` names.
 *
 * @param id - Its id, as typed
 * @returns The framework
 * @throws {Error} When no framework has the id
 * @example
 * ```ts
 * frameworkById("next").label; // "Next.js"
 * ```
 */
export function frameworkById(id: string): Framework {
  const found = FRAMEWORKS.find((framework) => framework.id === id);
  if (found) return found;
  throw new Error(
    `--framework takes ${FRAMEWORKS.map((framework) => framework.id).join(", ")}, not "${id}"`,
  );
}
