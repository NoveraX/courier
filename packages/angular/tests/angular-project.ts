import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/* The repository's packages, where a project's Angular and Courier resolve from. */
const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");

/** The shop the tests build the routes of: its cart opens `add` to a page and keeps `view`. */
export const APIS = `import { courier, defineApi, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const shop = defineApi({
  baseURL: "https://shop.example.com",
  groups: {
    cart: defineGroup({ endpoints: { add: endpoint.post("cart").expose(), view: endpoint.get("cart") } }),
  },
});
`;

/** The cart's `add` among the routes, as an optimized build writes them too: a key that is a name loses its quotes. */
export const ADD_OPEN = /"cart\.add":\{"?type"?:"mutation"\}/;

/** The cart's `view`, once an edit opens it. */
export const VIEW_OPEN = /"cart\.view":\{"?type"?:"query"\}/;

const ANGULAR_JSON = {
  version: 1,
  projects: {
    app: {
      projectType: "application",
      root: "",
      sourceRoot: "src",
      architect: {
        build: {
          builder: "@noverax/courier-angular:application",
          options: {
            outputPath: { base: "dist", browser: "" },
            index: "src/index.html",
            browser: "src/main.ts",
            tsConfig: "tsconfig.app.json",
          },
        },
        serve: {
          builder: "@noverax/courier-angular:dev-server",
          options: { buildTarget: "app:build" },
        },
      },
    },
  },
  cli: { analytics: false },
};

/** A page that shows the shop's routes, from the module Courier's builder builds. */
export const ROUTES_PAGE = `import { Component } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { routes } from "@noverax/courier/routes";

@Component({ selector: "app-root", template: "<p id=\\"routes\\">{{ shown }}</p>" })
class App {
  readonly shown = Object.keys(routes.shop.endpoints).join(",");
}

void bootstrapApplication(App);
`;

/** An Angular project on disk, its packages those of the repository. */
export interface AngularProject {
  readonly root: string;
  edit(path: string, change: (content: string) => string): void;
  remove(): void;
}

/**
 * Make an Angular project in a folder of its own that builds with Courier's
 * builders: the shop and its config, a page of the routes, and the files
 * given.
 *
 * @param files - More files, from the root, and their content
 * @returns The project
 * @example
 * ```ts
 * const project = angularProject({ "src/main.ts": ROUTES_PAGE });
 * ```
 */
export function angularProject(files: Record<string, string> = {}): AngularProject {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "courier-angular-test-")));
  symlinkSync(REPO_NODE_MODULES, join(root, "node_modules"), "dir");
  const all: Record<string, string> = {
    "package.json": '{ "name": "app", "private": true }\n',
    "angular.json": `${JSON.stringify(ANGULAR_JSON, null, 2)}\n`,
    "tsconfig.json":
      '{ "compilerOptions": { "strict": true, "target": "ES2022", "module": "ES2022", "moduleResolution": "bundler", "lib": ["ES2022", "dom"], "skipLibCheck": true } }\n',
    "tsconfig.app.json":
      '{ "extends": "./tsconfig.json", "files": ["src/main.ts", "courier-env.d.ts"] }\n',
    "courier-env.d.ts":
      'import type config from "./courier.config";\n\ndeclare module "@noverax/courier/routes" {\n  interface Register {\n    config: typeof config;\n  }\n}\n',
    "courier.config.ts":
      'import { shop } from "./src/apis";\n\nexport default { sources: { shop } };\n',
    "src/apis.ts": APIS,
    "src/index.html": "<!doctype html><html><body><app-root></app-root></body></html>\n",
    "src/main.ts": ROUTES_PAGE,
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return {
    root,
    edit: (path, change) => {
      const file = join(root, path);
      writeFileSync(file, change(readFileSync(file, "utf8")));
    },
    /* Windows keeps a folder a process has just let go of a while longer, as it closes its handles. */
    remove: () => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  };
}
