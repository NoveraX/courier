import type { AppKind } from "./targets";

/** How an application is served on a port, and how it tells it serves. */
export interface Serving {
  /** The command that serves it */
  readonly start: (port: number) => readonly string[];
  /** The environment it is served with */
  readonly env: (port: number) => Record<string, string>;
  /** What it prints once it serves */
  readonly ready: RegExp;
}

/** How one kind of application is built, served and told where the API is. */
export interface AppSettings {
  /** The checks that drive it, in `tests/` */
  readonly spec: string;
  /** The module the application reads the API's address from, written before it is built */
  readonly apiUrlModule: string;
  /** How it is built, when it is */
  readonly build?: readonly string[];
  /**
   * How it is served once built; none for a project that serves nothing,
   * whose checks run its own tools in its folder
   */
  readonly serve?: Serving;
  /** Its address as a browser opens it */
  readonly address: (port: number) => string;
  /**
   * `false` where the server hands the application a `Request` alone, which
   * carries no client address — `react-router-serve` does
   */
  readonly peerAddress?: false;
  /**
   * The page that shows the routes Courier's bundler plugin builds from the
   * application's config, and whether its server renders them into it — a
   * single-page application's do not; `routes.spec.ts` drives it
   */
  readonly routesPage?: {
    readonly path: string;
    readonly rendered: boolean;
    /** Whether the application serves the proxy a client built from the routes calls, at `/api/request` */
    readonly proxied: boolean;
    /** The module that defines the API the routes come from, from the application's root */
    readonly catalogModule: string;
  };
  /**
   * How its dev server is started, before the host and the port it is
   * given, and what it prints once it serves: the routes are checked under
   * it too, an edit to a definition among them. `address` gives the host and
   * the port as the server takes them, where it takes no `--host` and
   * `--port`.
   */
  readonly dev?: {
    readonly command: readonly string[];
    readonly ready: RegExp;
    readonly address?: (port: number) => readonly string[];
  };
}

/* The page a server renders the routes into, the browser shows them on again, and calls through the proxy from. */
const renderedRoutes = (catalogModule: string) =>
  ({ path: "/routes", rendered: true, proxied: true, catalogModule }) as const;

/* What Vite and the dev servers built on it print once they serve: `Local:`, or Astro's `Local`. */
const SERVING = /Local/;

const production = (port: number): Record<string, string> => ({
  NODE_ENV: "production",
  PORT: String(port),
  HOST: "127.0.0.1",
});

/* The application is opened as localhost and the other site as 127.0.0.1, so
   the browser counts them as two sites, as it would a real one elsewhere. */
const onLocalhost = (port: number): string => `http://localhost:${port}`;

/** Each kind of application the targets are built from. */
export const APPS: Readonly<Record<AppKind, AppSettings>> = {
  next: {
    spec: "next.spec.ts",
    apiUrlModule: "lib/api-url.ts",
    build: ["npx", "next", "build"],
    serve: {
      start: (port) => ["npx", "next", "start", "-p", String(port), "-H", "127.0.0.1"],
      env: production,
      ready: /Ready in/,
    },
    address: onLocalhost,
    /* Not lib/catalog.ts, which the cacheComponents overlay holds for an API of its own. */
    routesPage: renderedRoutes("lib/routes-api.ts"),
    dev: {
      command: ["npx", "next", "dev"],
      ready: /Ready in/,
      address: (port) => ["-H", "127.0.0.1", "-p", String(port)],
    },
  },
  sveltekit: {
    spec: "forms.spec.ts",
    apiUrlModule: "src/lib/api-url.js",
    build: ["npx", "vite", "build"],
    serve: {
      start: () => ["node", "build"],
      env: (port) => ({ ...production(port), ORIGIN: onLocalhost(port) }),
      ready: /Listening on/,
    },
    address: onLocalhost,
    routesPage: renderedRoutes("src/lib/catalog.js"),
    dev: { command: ["npx", "vite", "dev"], ready: SERVING },
  },
  nuxt: {
    spec: "nuxt.spec.ts",
    apiUrlModule: "lib/api-url.ts",
    build: ["npx", "nuxi", "build"],
    serve: {
      start: () => ["node", ".output/server/index.mjs"],
      env: production,
      ready: /Listening on/,
    },
    address: onLocalhost,
    routesPage: renderedRoutes("lib/catalog.ts"),
    /* Nuxt names its address while it still builds, serving a loading page meanwhile. */
    dev: { command: ["npx", "nuxi", "dev"], ready: /Nitro server built/ },
  },
  express: {
    /* It serves the routes the SvelteKit application has, so the same checks drive it. */
    spec: "forms.spec.ts",
    apiUrlModule: "api-url.mjs",
    serve: {
      start: () => ["node", "server.mjs"],
      env: production,
      ready: /Listening on/,
    },
    address: onLocalhost,
  },
  fastify: {
    /* It serves the routes the SvelteKit application has, so the same checks drive it. */
    spec: "forms.spec.ts",
    apiUrlModule: "api-url.mjs",
    serve: {
      start: () => ["node", "server.mjs"],
      env: production,
      ready: /Listening on/,
    },
    address: onLocalhost,
  },
  hono: {
    /* It serves the routes the SvelteKit application has, so the same checks drive it. */
    spec: "forms.spec.ts",
    apiUrlModule: "api-url.mjs",
    serve: {
      start: () => ["node", "server.mjs"],
      env: production,
      ready: /Listening on/,
    },
    address: onLocalhost,
  },
  astro: {
    /* It serves the routes the SvelteKit application has, so the same checks drive it. */
    spec: "forms.spec.ts",
    apiUrlModule: "src/lib/api-url.mjs",
    build: ["npx", "astro", "build"],
    serve: {
      start: () => ["node", "dist/server/entry.mjs"],
      env: production,
      ready: /listening on/i,
    },
    address: onLocalhost,
    routesPage: renderedRoutes("src/lib/catalog.mjs"),
    dev: { command: ["npx", "astro", "dev"], ready: SERVING },
  },
  "react-router": {
    /* It serves the routes the SvelteKit application has, so the same checks drive it. */
    spec: "forms.spec.ts",
    apiUrlModule: "app/api-url.ts",
    build: ["npx", "react-router", "build"],
    serve: {
      start: () => ["npx", "react-router-serve", "build/server/index.js"],
      env: production,
      ready: /react-router-serve/,
    },
    address: onLocalhost,
    peerAddress: false,
    routesPage: renderedRoutes("app/catalog.ts"),
    dev: { command: ["npx", "react-router", "dev"], ready: SERVING },
  },
  remix: {
    /* It serves the routes the SvelteKit application has, so the same checks drive it. */
    spec: "forms.spec.ts",
    apiUrlModule: "app/api-url.ts",
    build: ["npx", "remix", "vite:build"],
    serve: {
      start: () => ["node", "server.mjs"],
      env: production,
      ready: /Listening on/,
    },
    address: onLocalhost,
    routesPage: renderedRoutes("app/catalog.ts"),
    dev: { command: ["npx", "remix", "vite:dev"], ready: SERVING },
  },
  "solid-start": {
    /* It serves the routes the SvelteKit application has, so the same checks drive it. */
    spec: "forms.spec.ts",
    apiUrlModule: "src/lib/api-url.ts",
    build: ["npx", "vite", "build"],
    serve: {
      start: () => ["node", ".output/server/index.mjs"],
      env: production,
      ready: /Listening on/i,
    },
    address: onLocalhost,
    routesPage: renderedRoutes("src/lib/catalog.ts"),
    dev: { command: ["npx", "vite", "dev"], ready: SERVING },
  },
  nestjs: {
    /* It serves the routes the SvelteKit application has, so the same checks drive it. */
    spec: "forms.spec.ts",
    apiUrlModule: "src/api-url.ts",
    build: ["npx", "tsc", "-p", "tsconfig.json"],
    serve: {
      start: () => ["node", "dist/main.js"],
      env: production,
      ready: /Listening on/,
    },
    address: onLocalhost,
  },
  spa: {
    spec: "spa.spec.ts",
    apiUrlModule: "src/api-url.ts",
    build: ["npx", "vite", "build"],
    serve: {
      start: (port) => [
        "npx",
        "vite",
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--strictPort",
      ],
      env: production,
      ready: /Local:/,
    },
    /* The page and the API share a host, as an application and its API on one domain do. */
    address: (port) => `http://127.0.0.1:${port}`,
    routesPage: { path: "/", rendered: false, proxied: false, catalogModule: "src/catalog.ts" },
    dev: { command: ["npx", "vite", "dev"], ready: SERVING },
  },
  vitest: {
    /* A project's own tests, run by the Vitest the version installs: it serves nothing. */
    spec: "vitest.spec.ts",
    apiUrlModule: "src/api-url.ts",
    address: onLocalhost,
  },
};
