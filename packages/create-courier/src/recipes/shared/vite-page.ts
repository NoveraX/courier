import type { NextStep, RecipeContext, RecipeFile } from "../recipe-types";
import { DEMO_TEXT } from "./demo-parts";
import { devScript } from "./next-steps";

/** The page's file, in the project's root, where Vite serves every HTML file while you develop. */
export const VITE_PAGE = "courier.html";

/** Where Vite's dev server listens unless the project's dev script moves it. */
export const VITE_DEFAULT_PORT = 5173;

/* What a person types to start Vite: the app's dev script, run with its package manager. */
function devCommand(ctx: RecipeContext): string {
  return ctx.manager.run(devScript(ctx));
}

/* The port the dev script names with `--port`, else Vite's own. */
function devPort(ctx: RecipeContext): number {
  const script = ctx.project.manifest.scripts[devScript(ctx)] ?? "";
  const port = /(?:^|\s)--port[=\s]+(\d+)(?=\s|$)/.exec(script)?.[1];
  return port === undefined ? VITE_DEFAULT_PORT : Number(port);
}

/**
 * `courier.html`: the page of its own that shows Courier at work, beside
 * the app's. Vite serves it, and turns its entry's TypeScript into what a
 * browser runs, only while its dev server runs; opened from disk, its
 * entry's root-relative path points at the disk's root. So the node the
 * page mounts into says how to see it, which the page replaces once it
 * renders.
 *
 * @param ctx - The project, and what is set up in it
 * @param mount - The id of the node the page renders into
 * @param entry - The module that renders it, relative to the root
 * @returns The file
 * @example
 * ```ts
 * vitePage(ctx, "root", "src/courier/main.tsx").path; // "courier.html"
 * ```
 */
export function vitePage(ctx: RecipeContext, mount: string, entry: string): RecipeFile {
  const command = devCommand(ctx);
  const content = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <title>${DEMO_TEXT.title}</title>
  </head>
  <body>
    <div id="${mount}">
      <p>
        This page is served by Vite while you develop: run
        <code>${command}</code> and open /${VITE_PAGE} at the address it prints.
      </p>
    </div>
    <script type="module" src="/${entry}"></script>
  </body>
</html>
`;
  return {
    path: VITE_PAGE,
    content,
    purpose: `the page Vite serves at /${VITE_PAGE} while ${command} runs; it does not open from disk`,
  };
}

/**
 * The step that starts the app and opens its page: the page's full
 * address at the port Vite takes — where another server holds that port,
 * Vite takes the next free one, so the address Vite prints stands beside
 * it.
 *
 * @param ctx - The project, and what is set up in it
 * @returns The step
 * @example
 * ```ts
 * viteDevStep(ctx); // { command: "npm run dev", what: "starts the app: open http://localhost:5173/courier.html, or the address Vite prints" }
 * ```
 */
export function viteDevStep(ctx: RecipeContext): NextStep {
  return {
    command: devCommand(ctx),
    what: `starts the app: open http://localhost:${devPort(ctx)}/${VITE_PAGE}, or the address Vite prints`,
  };
}
