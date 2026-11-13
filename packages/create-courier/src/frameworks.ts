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
