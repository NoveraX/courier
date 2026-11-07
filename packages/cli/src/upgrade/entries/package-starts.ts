import { readdirSync } from "node:fs";
import { posix } from "node:path";
import type { Project } from "@noverax/create-courier/engine";

import { isRecord } from "../../util/is-record";
import { configuredRoot } from "./expo-config";
import { viteStart } from "./vite-config";

/* A path a package's own file names, relative to its root and `/`-separated; none where it leads out of it. */
function inPackage(path: string): string | undefined {
  const plain = posix
    .normalize(path.replaceAll("\\", "/"))
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
  const out = plain === "." || plain === ".." || plain.startsWith("../") || posix.isAbsolute(plain);
  return plain === "" || out ? undefined : plain;
}

/* A file of the package's, as JSON; none where it is not there or not JSON. */
function json(project: Project, path: string): unknown {
  try {
    return JSON.parse(project.read(path) ?? "null");
  } catch {
    return undefined;
  }
}

/**
 * Expo Router's folder of routes: the root Expo's config gives its
 * plugin — app.json's, or an app.config's read without running it —
 * else `src/app` where it is, which wins over `app`, else `app`; and,
 * where the app.config is not data the upgrade reads, a step that says
 * what of it is not.
 *
 * @param project - The app's package
 * @returns The folder, relative to the package's root, and the step where there is one
 * @example
 * ```ts
 * expoRoutes(readProject("/work/app")).routes; // "src/app"
 * ```
 */
export function expoRoutes(project: Project): {
  readonly routes: string;
  readonly note?: { readonly file: string; readonly what: string };
} {
  const configured = configuredRoot(project);
  const named = "root" in configured ? inPackage(configured.root ?? "") : undefined;
  const routes = named ?? (project.exists("src/app") ? "src/app" : "app");
  if (!("unread" in configured)) return { routes };
  const what = `Not read: ${configured.unread} is not data Courier reads, so Expo Router's routes are read from ${routes}`;
  return { routes, note: { file: configured.file, what } };
}

/**
 * The file package.json's `main` names, without its extension: where an
 * app starts, where it is one of the package's own files.
 *
 * @param project - The package
 * @returns The file, relative to the package's root; none where `main` names nothing in it
 * @example
 * ```ts
 * mainOf(readProject("/work/app")); // "src/index"
 * ```
 */
export function mainOf(project: Project): string | undefined {
  const manifest = json(project, "package.json");
  const main = isRecord(manifest) && typeof manifest.main === "string" ? manifest.main : "";
  return inPackage(main)?.replace(/\.[cm]?[jt]sx?$/, "");
}

/* A module script of an HTML page: what Vite builds the page from. */
const SCRIPT = /<script\b([^>]*)>/gi;
/* Folders with no page of Vite's own: installed packages, what is served as it is, what builds write. */
const NO_PAGE = new Set(["node_modules", "public", "dist", "build", "out", "coverage"]);
/* What the plan says where it is not told where a page Vite builds beside a server starts. */
const UNTOLD = "so no file of the package is told a side";

/* The folders of a package's root, but those that hold no page, and those whose names start with a dot. */
function folders(project: Project): string[] {
  try {
    return readdirSync(project.root, { withFileTypes: true })
      .filter((each) => each.isDirectory() && !each.name.startsWith(".") && !NO_PAGE.has(each.name))
      .map((each) => each.name);
  } catch {
    return [];
  }
}

/* The folder a Vite config's root names: `""` for the package's own; none where it leads out of it. */
function folderOf(root: string): string | undefined {
  const plain = posix.normalize(root.replaceAll("\\", "/")).replace(/\/+$/, "");
  return plain === "." ? "" : inPackage(plain);
}

/* An HTML page Vite may build a package's page from: its file and folder, its module scripts' sources, and whether one of them is written in the page. */
interface VitePage {
  readonly path: string;
  readonly folder: string;
  readonly sources: readonly string[];
  readonly inline: boolean;
}

/* The page an HTML file of the package's is, where it holds a module script. */
function pageAt(project: Project, page: string): VitePage | undefined {
  const modules = [...(project.read(page) ?? "").matchAll(SCRIPT)]
    .map(([, attributes = ""]) => attributes)
    .filter((attributes) => /\btype\s*=\s*["']?module\b/i.test(attributes));
  if (modules.length === 0) return undefined;
  const written = modules.map(
    (attributes) => /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1],
  );
  const sources = written.flatMap((src) => {
    const plain = src?.replace(/[?#].*$/, "");
    return plain === undefined || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(plain) ? [] : [plain];
  });
  const inline = written.includes(undefined);
  return { path: page, folder: posix.dirname(page), sources, inline };
}

/* Each HTML page Vite may build a package's page from: the `index.html` of the root its config names, else one at the package's root or in a folder below it, which a command line may name for the root. */
function vitePages(project: Project, root: string | undefined): VitePage[] {
  const pages =
    root === undefined
      ? ["index.html", ...folders(project).map((name) => `${name}/index.html`)]
      : [posix.join(root, "index.html")];
  return pages.flatMap((page) => pageAt(project, page) ?? []);
}

/* The modules a page's scripts name: a relative one from its folder, a `/` from Vite's root — the config's, else the page's folder or the package's. */
function scriptsOf(project: Project, page: VitePage, root: string | undefined): string[] {
  return page.sources.flatMap((src) => {
    const bases = src.startsWith("/")
      ? root === undefined
        ? [page.folder, "."]
        : [root]
      : [page.folder];
    return bases.flatMap((base) => {
      const path = inPackage(posix.join(base, src.replace(/^\//, "")));
      return path !== undefined && project.exists(path) ? [path] : [];
    });
  });
}

/** Where a page Vite builds starts: its modules, why the upgrade does not read where, or that no entry of Vite's is there, so Vite builds no page. */
export type ViteEntries =
  | { readonly entries: ReadonlySet<string> }
  | { readonly note: { readonly file: string; readonly what: string } }
  | { readonly none: true };

/**
 * The modules a page Vite builds starts from, whatever framework it is
 * built with: the input its config gives as data — each HTML page's
 * module scripts, each module itself — else the module scripts of the
 * `index.html` of the root its config names, or of one at the package's
 * root or in a folder below it. Where neither is there, and the config
 * is data or there is none, Vite builds no page; where the config's
 * root or input is not data, or the entry leads to no module the
 * upgrade reads, a step that says why, and no module.
 *
 * @param project - The page's package
 * @returns The modules, relative to the package's root; else the step, or that there is no entry
 * @example
 * ```ts
 * viteEntries(readProject("/work/app")); // { entries: Set { "src/react-app/main.tsx" } }
 * ```
 */
export function viteEntries(project: Project): ViteEntries {
  const start = viteStart(project);
  if ("unread" in start) {
    const what = `Not read: ${start.unread} is not data Courier reads, ${UNTOLD}`;
    return { note: { file: start.file, what } };
  }
  const file = start.file ?? "package.json";
  const root = start.root === undefined ? undefined : folderOf(start.root);
  if (start.root !== undefined && root === undefined)
    return { note: { file, what: `Not read: its root leads out of the package, ${UNTOLD}` } };
  const entries = new Set<string>();
  const pages = start.input === undefined ? vitePages(project, root) : [];
  if (start.input === undefined && pages.length === 0) return { none: true };
  for (const written of start.input ?? []) {
    const bases = written.fromPackage ? [""] : [root ?? "", ""];
    const path = bases
      .map((base) => inPackage(posix.join(base, written.path)))
      .find((each) => each !== undefined && project.exists(each));
    const page = path?.endsWith(".html") === true ? pageAt(project, path) : undefined;
    if (page !== undefined) pages.push(page);
    else if (path !== undefined && !path.endsWith(".html")) entries.add(path);
  }
  const inline = pages.find((page) => page.inline);
  if (inline !== undefined) {
    const what = `Not read: it holds a module script written in the page, which Courier does not read, ${UNTOLD}`;
    return { note: { file: inline.path, what } };
  }
  for (const page of pages) for (const path of scriptsOf(project, page, root)) entries.add(path);
  if (entries.size > 0) return { entries };
  const what = `Not read: the page Vite builds beside the server starts from no module Courier finds in the package, ${UNTOLD}`;
  return { note: { file: start.input === undefined ? (pages[0]?.path ?? file) : file, what } };
}

/**
 * The folders Vite may take for a package's root, which a `/` in its
 * code is read from: the root its config names, else the folder of each
 * HTML page it may build from, as {@link viteEntries} reads them; and the
 * package's own, Vite's root where nothing names another.
 *
 * @param project - The package
 * @returns The folders, relative to the package's root: `""` for the root itself
 * @example
 * ```ts
 * viteRoots(readProject("/work/shop")); // ["client", ""]
 * ```
 */
export function viteRoots(project: Project): readonly string[] {
  const start = viteStart(project);
  const root = "unread" in start || start.root === undefined ? undefined : folderOf(start.root);
  const pages = vitePages(project, root).map(({ folder }) => (folder === "." ? "" : folder));
  return [...new Set([...(root === undefined ? [] : [root]), ...pages, ""])];
}
