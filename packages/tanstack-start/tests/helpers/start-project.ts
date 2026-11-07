import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/* This package, whose build the app installs, and the repository's packages, the app's others. */
const PACKAGE = resolve(import.meta.dirname, "../..");
const REPO_NODE_MODULES = resolve(PACKAGE, "../../node_modules");

/* The router and the root route every app here starts from, written without JSX: Vite builds them as they are. */
const BASE: Record<string, string> = {
  "package.json": '{ "type": "module" }\n',
  "src/router.tsx": `import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({ routeTree });
}
`,
  "src/routes/__root.tsx": `import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { createElement as h } from "react";

export const Route = createRootRoute({
  component: () => h("html", null, h("head", null, h(HeadContent)), h("body", null, h(Outlet), h(Scripts))),
});
`,
};

/** An API the apps here call, and a caller for it made with `/react`. */
export const CALLER = `import { courier, defineApi } from "@noverax/courier/define";
import { createServerCaller } from "@noverax/courier-tanstack-start/react";

const { endpoint } = courier();
const accounts = defineApi({
  name: "accounts",
  baseURL: "https://accounts.example.com",
  session: { cookies: ["sid"] },
  endpoints: { me: endpoint.get("me") },
});

export const server = createServerCaller(accounts);
`;

/** A TanStack Start app for React on disk, with this package installed in it. */
export interface StartProject {
  readonly root: string;
  /** Whether the built files under a folder, from the root, hold any of the adapter's code, or import it. */
  takesAdapter(folder: string): boolean;
  remove(): void;
}

/**
 * Make an app in a folder of its own: the router, the root route and the
 * files given, the repository's packages one folder up, and this package
 * installed as a copy of its build, under `node_modules` as an install puts
 * it — where TanStack Start checks no module's imports.
 *
 * @param files - Each file, from the root, and its content
 * @returns The app
 * @throws When this package is not built
 * @example
 * ```ts
 * const app = startProject({ "src/lib/me.ts": CALLER });
 * ```
 */
export function startProject(files: Record<string, string>): StartProject {
  if (!existsSync(join(PACKAGE, "lib/react.js"))) {
    throw new Error("Build @noverax/courier-tanstack-start first: the app installs its lib/");
  }
  const base = realpathSync(mkdtempSync(join(tmpdir(), "courier-tanstack-start-")));
  symlinkSync(REPO_NODE_MODULES, join(base, "node_modules"), "dir");
  const root = join(base, "app");
  for (const [path, content] of Object.entries({ ...BASE, ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  const installed = join(root, "node_modules/@noverax/courier-tanstack-start");
  mkdirSync(installed, { recursive: true });
  cpSync(join(PACKAGE, "package.json"), join(installed, "package.json"));
  cpSync(join(PACKAGE, "lib"), join(installed, "lib"), { recursive: true });
  return {
    root,
    /* A string of the adapter's own, which no minifier renames — the key of what marks a request
       answered — or the package's name, where a server's build leaves what is installed to Node. */
    takesAdapter: (folder) =>
      readdirSync(join(root, folder), { recursive: true, withFileTypes: true }).some(
        (entry) =>
          entry.isFile() &&
          /\.m?js$/.test(entry.name) &&
          /courier\.tanstackStart\.answered|@noverax\/courier-tanstack-start/.test(
            readFileSync(join(entry.parentPath, entry.name), "utf8"),
          ),
      ),
    remove: () => rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  };
}
