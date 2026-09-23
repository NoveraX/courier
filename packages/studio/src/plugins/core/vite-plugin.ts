import type { Plugin } from "vite";
import { RESOLVED_ID, RUNTIME_SPECIFIER, VIRTUAL_ID } from "./constants";
import { isInjectionEnabled } from "./options";
import { resolveSnippet } from "./resolve-snippet";
import { RUNTIME_IMPORTER } from "./runtime-importer";
import type { StudioPluginOptions } from "./types";

/**
 * Vite's browser client. Every page a Vite dev server serves loads it,
 * including the pages of SvelteKit, React Router, SolidStart, Astro and Nuxt,
 * which render their own HTML and never pass it through `transformIndexHtml`.
 */
const VITE_CLIENT = /\/vite\/dist\/client\/client\.mjs(?:\?|$)/;

const PACKAGE_NAME = "@noverax/courier-studio";

/**
 * The Vite plugin behind every Vite-based Studio integration.
 *
 * It appends a dynamic import of the connect snippet to Vite's own client, so
 * the snippet reaches the browser whatever renders the page. The import is
 * dynamic so that a snippet that fails to load cannot take hot module
 * replacement down with it.
 *
 * @param framework - Names the browser runtime: `${framework}-browser`.
 * @param options - Plugin options shared by every Studio integration.
 * @returns A Vite plugin that applies to the dev server only.
 */
export function createStudioVitePlugin(framework: string, options?: StudioPluginOptions): Plugin {
  let pending: Promise<string | null> | null = null;
  const snippet = (): Promise<string | null> => (pending ??= resolveSnippet(framework, options));

  return {
    name: "courier-studio",
    apply: "serve",
    /* Ahead of Vite's resolver, which would look for the runtime from the app
       root first and so behave differently under npm and pnpm. */
    enforce: "pre",
    config() {
      if (!isInjectionEnabled(options)) return undefined;
      /* The runtime reaches socket.io-client, whose development build imports
         `debug`, a CommonJS module a browser cannot run until Vite pre-bundles
         it. Vite pre-bundles nothing that a package in node_modules imports,
         so without this the page failed wherever the runtime was not hoisted
         to the app root. The nested form finds it through this package. */
      return { optimizeDeps: { include: [`${PACKAGE_NAME} > ${RUNTIME_SPECIFIER}`] } };
    },
    resolveId(source, importer) {
      if (source === VIRTUAL_ID) return RESOLVED_ID;
      if (importer === RESOLVED_ID && source === RUNTIME_SPECIFIER) {
        return this.resolve(source, RUNTIME_IMPORTER, { skipSelf: true });
      }
      return undefined;
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
