import type { Plugin } from "vite";
import { RESOLVED_ID, RUNTIME_SPECIFIER, VIRTUAL_ID } from "./constants";
import { courierClientDeps } from "./courier-client-deps";
import { shareDevServerOrigin, shareFirstRequestOrigin } from "./dev-server-origin";
import { isInjectionEnabled } from "./options";
import { resolveSnippet } from "./resolve-snippet";
import { runtimeEntryPath } from "./runtime-importer";
import type { StudioPluginOptions } from "./types";

/**
 * Vite's browser client. Every page a Vite dev server serves loads it,
 * including the pages of SvelteKit, React Router, SolidStart, Astro and Nuxt,
 * which render their own HTML and never pass it through `transformIndexHtml`.
 */
const VITE_CLIENT = /\/vite\/dist\/client\/client\.mjs(?:\?|$)/;

/**
 * What the connect snippet imports the runtime as. No package exports it:
 * the plugin aliases it to the runtime's browser file, and Vite pre-bundles
 * that file under this name.
 */
const BROWSER_RUNTIME = `${RUNTIME_SPECIFIER}/browser`;

/** The plugin applies to the dev server only, which serves a development build. */
const DEV_SERVER = true;

/**
 * The Vite plugin behind every Vite-based Studio integration.
 *
 * It appends a dynamic import of the connect snippet to Vite's own client, so
 * the snippet reaches the browser whatever renders the page. The import is
 * dynamic so that a snippet that fails to load cannot take hot module
 * replacement down with it. When the dev server starts listening it tells
 * the app that address, where the Playground sends its proxy calls; in
 * middleware mode the app's own server listens, and the socket of the first
 * request it hands Vite tells where.
 *
 * @param framework - Names the browser runtime: `${framework}-browser`.
 * @param options - Plugin options shared by every Studio integration.
 * @returns A Vite plugin that applies to the dev server only.
 */
export function createStudioVitePlugin(framework: string, options?: StudioPluginOptions): Plugin {
  let projectRoot: string | undefined;
  let pending: Promise<string | null> | null = null;
  const snippet = (): Promise<string | null> =>
    (pending ??= resolveSnippet({
      framework,
      options,
      development: DEV_SERVER,
      runtime: BROWSER_RUNTIME,
      projectRoot,
    }));

  return {
    name: "courier-studio",
    apply: "serve",
    /* Ahead of the app's other plugins, so none takes the connect module's
       name for a package's. */
    enforce: "pre",
    config(config) {
      if (!isInjectionEnabled(options, DEV_SERVER)) return undefined;
      /* The runtime reaches socket.io-client, whose development build imports
         `debug`, a CommonJS module a browser cannot run until Vite pre-bundles
         it, and Vite pre-bundles nothing a package in node_modules imports:
         so the runtime is pre-bundled itself. It goes by its browser file,
         found from this package. By package name it followed the app's
         client resolve conditions, and where they leave out `browser`, as
         SolidStart's do, the page got the server's runtime; and the app root
         found the package only where the package manager hoisted it.
         Courier's own browser modules go with it, so the first page that
         imports them is not reloaded. */
      const app = courierClientDeps(config.root ?? process.cwd());
      return {
        resolve: { alias: [{ find: BROWSER_RUNTIME, replacement: runtimeEntryPath() }] },
        optimizeDeps: { include: [BROWSER_RUNTIME, ...app] },
      };
    },
    /* The app's config is found from Vite's root, not from wherever Vite was
       started. */
    configResolved(config) {
      projectRoot = config.root;
    },
    configureServer(server) {
      if (!isInjectionEnabled(options, DEV_SERVER)) return;
      const listener = server.httpServer;
      if (!listener) {
        server.middlewares.use(shareFirstRequestOrigin());
        return;
      }
      listener.once("listening", () => {
        shareDevServerOrigin(listener.address(), Boolean(server.config.server.https));
      });
    },
    resolveId(source) {
      return source === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return undefined;
      return (await snippet()) ?? "";
    },
    async transform(code, id, transformOptions) {
      if (transformOptions?.ssr || !VITE_CLIENT.test(id)) return undefined;
      if (!(await snippet())) return undefined;
      return { code: `${code}\n${IMPORT_SNIPPET}`, map: null };
    },
  };
}

const IMPORT_SNIPPET = `import(${JSON.stringify(VIRTUAL_ID)}).catch((error) => {
  console.warn("[courier-studio] Could not connect this page to Studio", error);
});
`;
