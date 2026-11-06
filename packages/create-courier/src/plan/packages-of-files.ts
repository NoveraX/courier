import { importsOf } from "../edit/imports";
import { scanSource } from "../edit/source-scan";
import { courierPackage } from "../recipes/shared/packages";
import type { PlannedFile } from "./build-plan";

/** The packages Courier's files need, as dependencies and as dev dependencies. */
export interface FilePackages {
  readonly dependencies: readonly string[];
  readonly devDependencies: readonly string[];
}

/*
 * The packages the example's files import, which the setup installs for
 * those files alone: how each is listed — the app runs with the API's
 * schemas and its hooks, Studio runs the mock while you develop — and the
 * packages it needs beside it, its peers.
 */
const NEEDED_BY_FILES: Readonly<
  Record<string, { readonly dev: boolean; readonly peers: readonly string[] }>
> = {
  zod: { dev: false, peers: [] },
  "@noverax/courier-react": { dev: false, peers: ["@tanstack/react-query"] },
  "@noverax/courier-mock": { dev: true, peers: ["hono", "@hono/node-server"] },
};

/* The package a module specifier names: `zod/v4` is zod's, `@noverax/courier-react/x` is `@noverax/courier-react`. */
function packageOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

/* A package as the setup installs it: Courier's at the command's release, the others at their latest. */
function specOf(name: string): string {
  return name.startsWith("@noverax/") ? courierPackage(name) : name;
}

/**
 * The packages that Courier's files in a project need — those the plan
 * adds, and those an earlier setup added, as the project has them now —
 * read from what each file imports: the example's API needs Zod, its
 * hooks Courier's React bindings and React Query, and its mock the mock
 * server and what it runs on. A run after one whose install never
 * happened installs them, whatever else the project has since.
 *
 * @param files - The plan's files; a file of the project's own, `kept`, is not Courier's
 * @param read - Reads a file of the project's
 * @returns The packages, each with its range where it has one
 * @example
 * ```ts
 * packagesOfFiles(plan.files, project.read); // { dependencies: ["zod"], devDependencies: [] } where only the API is there
 * ```
 */
export function packagesOfFiles(
  files: readonly PlannedFile[],
  read: (path: string) => string | undefined,
): FilePackages {
  /* Each package needed, and whether it is a dev one; its peers are listed as it is. */
  const needed = new Map<string, boolean>();
  for (const file of files) {
    const text = file.state === "courier" ? read(file.path) : file.content;
    if (file.state === "kept" || text === undefined) continue;
    /* Read for what it imports, so a page's markup around its script does not stop the read. */
    const scan = scanSource(text, true);
    for (const { specifier } of scan === undefined ? [] : importsOf(scan)) {
      const name = packageOf(specifier);
      const needs = NEEDED_BY_FILES[name];
      if (needs === undefined) continue;
      for (const each of [name, ...needs.peers]) needed.set(each, needs.dev);
    }
  }
  const listed = [...needed];
  return {
    dependencies: listed.filter(([, dev]) => !dev).map(([name]) => specOf(name)),
    devDependencies: listed.filter(([, dev]) => dev).map(([name]) => specOf(name)),
  };
}
