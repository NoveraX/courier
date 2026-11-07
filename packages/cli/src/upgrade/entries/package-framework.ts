import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { detectFrameworks, type Project, routeList } from "@noverax/create-courier/engine";

import type { PackageFramework, PackageFrameworkId } from "./framework-roots";
import { expoRoutes, mainOf, viteEntries } from "./package-starts";
import { SERVERS } from "./path-rules";

/** A step of a package's config that is not data, its file relative to the workspace's root. */
export interface ConfigNote {
  readonly file: string;
  readonly what: string;
}

const NO_ENTRIES: ReadonlySet<string> = new Set();
const NO_VITE_ENTRY = { none: true } as const;
/* What a page is rendered with, whichever bundler builds it, and what a server may render HTML with alone: a package that lists one may have a page. */
const PAGE_LIBRARIES = [
  "react",
  "vue",
  "svelte",
  "solid-js",
  "preact",
  "lit",
  "@angular/core",
  "@builder.io/qwik",
  "@qwik.dev/core",
];
/* What the plan says of a package beside a server that lists a library a page renders with, where Vite has no entry. */
function untold(library: string): string {
  return `Not read: it lists ${library}, and Vite has no entry here: a page another bundler builds with it and a server that renders HTML with it alone look alike to Courier, so no file of the package is told a side`;
}

/* A step of a package's config, its file made relative to the root. */
function inPackage(dir: string, note: ConfigNote): ConfigNote {
  return { ...note, file: join(dir, note.file).split("\\").join("/") };
}

/* The route modules React Router's routes file names, where it names them rather than reading the folder. */
function routeModules(root: string, dir: string): ReadonlySet<string> | undefined {
  const file = ["app/routes.ts", "app/routes.js"]
    .map((each) => join(root, dir, each))
    .find(existsSync);
  const list = file === undefined ? undefined : routeList(readFileSync(file, "utf8"));
  return list === undefined || list.fromFolder ? undefined : list.modules;
}

/**
 * The framework a package's package.json lists, as the graph reads it:
 * with the route modules React Router's routes file names, Expo
 * Router's folder of routes and the app's `main`, and, for a page Vite
 * builds beside a server framework — React's, Vue's, or one whose
 * framework no list knows, `vite` — the modules it starts from, or a
 * step where they are not read, and then no file of the package takes a
 * side. Where Vite has no entry at all, it builds no page: where the
 * package lists what a page renders with — React, Vue, Svelte, Solid,
 * Preact, Lit and the like — another bundler may build one with it, or
 * the server render HTML with it alone, which look alike, and a step
 * says no file takes a side; else the server's rules read the package.
 *
 * @param root - The workspace's folder
 * @param dir - The package's folder, relative to it
 * @param project - The package's project; none where its package.json does not read
 * @returns The framework, and the steps of its configs that are not data
 * @example
 * ```ts
 * packageFramework(root, "apps/shop", project).framework.id; // "vite", for Express beside a page of Preact's
 * ```
 */
export function packageFramework(
  root: string,
  dir: string,
  project: Project | undefined,
): { readonly framework: PackageFramework; readonly notes: readonly ConfigNote[] } {
  const notes: ConfigNote[] = [];
  const listed = project === undefined ? [] : detectFrameworks(project).map((each) => each.id);
  const server = listed.some((each) => SERVERS.has(each));
  const page = listed.find((each) => !SERVERS.has(each));
  const library = PAGE_LIBRARIES.find((each) => project?.lists(each) === true);
  const renders = library !== undefined;
  /* A page beside a server — React's, Vue's, or one whose framework no list knows — starts from Vite's entries. */
  const beside =
    server &&
    project !== undefined &&
    (page === "react" ||
      page === "vue" ||
      (page === undefined && (renders || project.lists("vite"))));
  const entries = !beside
    ? undefined
    : project.lists("vite")
      ? viteEntries(project)
      : NO_VITE_ENTRY;
  if (entries !== undefined && "note" in entries) notes.push(inPackage(dir, entries.note));
  /* With no entry of Vite's at all, Vite builds no page: where the package lists what a page renders with, another bundler may build one, or the server render HTML with it alone, which look alike; else Vite is a tool of the server's, and the server's rules read the package. */
  const none = entries !== undefined && "none" in entries;
  const elsewhere = none && (page !== undefined || renders);
  if (elsewhere) notes.push(inPackage(dir, { file: "package.json", what: untold(library ?? "") }));
  const pageless = none && !elsewhere;
  const id: PackageFrameworkId | undefined = !beside
    ? listed[0]
    : pageless
      ? listed.find((each) => SERVERS.has(each))
      : (page ?? (elsewhere ? undefined : "vite"));
  const withServer =
    id !== undefined &&
    !SERVERS.has(id) &&
    server &&
    (entries === undefined || "entries" in entries);
  const expo = id === "expo" && project !== undefined;
  const started = expo ? expoRoutes(project) : undefined;
  if (started?.note !== undefined) notes.push(inPackage(dir, started.note));
  const framework = {
    id,
    routeModules: id === "react-router" ? routeModules(root, dir) : undefined,
    routes: started?.routes,
    main: expo ? mainOf(project) : undefined,
    withServer,
    pageEntries:
      entries === undefined || pageless
        ? undefined
        : "entries" in entries
          ? entries.entries
          : NO_ENTRIES,
  };
  return { framework, notes };
}
