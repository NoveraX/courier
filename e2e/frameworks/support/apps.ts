import type { AppKind } from "./targets";

/** How one kind of application is built, served and told where the API is. */
export interface AppSettings {
  /** The checks that drive it, in `tests/` */
  readonly spec: string;
  /** The module the application reads the API's address from, written before it is built */
  readonly apiUrlModule: string;
  /** How it is built, when it is */
  readonly build?: readonly string[];
  /** How it is served on a port */
  readonly start: (port: number) => readonly string[];
  /** The environment it is served with */
  readonly env: (port: number) => Record<string, string>;
  /** What it prints once it serves */
  readonly ready: RegExp;
  /** Its address as a browser opens it */
  readonly address: (port: number) => string;
  /**
   * `false` where the server hands the application a `Request` alone, which
   * carries no client address — `react-router-serve` does
   */
  readonly peerAddress?: false;
}

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
    start: (port) => ["npx", "next", "start", "-p", String(port), "-H", "127.0.0.1"],
    env: production,
    ready: /Ready in/,
    address: onLocalhost,
  },
  sveltekit: {
    spec: "forms.spec.ts",
    apiUrlModule: "src/lib/api-url.js",
    build: ["npx", "vite", "build"],
    start: () => ["node", "build"],
    env: (port) => ({ ...production(port), ORIGIN: onLocalhost(port) }),
    ready: /Listening on/,
    address: onLocalhost,
  },
  nuxt: {
    spec: "nuxt.spec.ts",
    apiUrlModule: "lib/api-url.ts",
    build: ["npx", "nuxi", "build"],
    start: () => ["node", ".output/server/index.mjs"],
    env: production,
    ready: /Listening on/,
    address: onLocalhost,
  },
  express: {
    /* It serves the routes the SvelteKit application has, so the same checks drive it. */
    spec: "forms.spec.ts",
    apiUrlModule: "api-url.mjs",
    start: () => ["node", "server.mjs"],
    env: production,
    ready: /Listening on/,
    address: onLocalhost,
  },
  fastify: {
    /* It serves the routes the SvelteKit application has, so the same checks drive it. */
    spec: "forms.spec.ts",
    apiUrlModule: "api-url.mjs",
    start: () => ["node", "server.mjs"],
    env: production,
    ready: /Listening on/,
    address: onLocalhost,
  },
  hono: {
    /* It serves the routes the SvelteKit application has, so the same checks drive it. */
    spec: "forms.spec.ts",
    apiUrlModule: "api-url.mjs",
    start: () => ["node", "server.mjs"],
    env: production,
    ready: /Listening on/,
    address: onLocalhost,
  },
  astro: {
    /* It serves the routes the SvelteKit application has, so the same checks drive it. */
    spec: "forms.spec.ts",
    apiUrlModule: "src/lib/api-url.mjs",
    build: ["npx", "astro", "build"],
    start: () => ["node", "dist/server/entry.mjs"],
    env: production,
    ready: /listening on/i,
    address: onLocalhost,
  },
  "react-router": {
    /* It serves the routes the SvelteKit application has, so the same checks drive it. */
    spec: "forms.spec.ts",
    apiUrlModule: "app/api-url.ts",
    build: ["npx", "react-router", "build"],
    start: () => ["npx", "react-router-serve", "build/server/index.js"],
    env: production,
    ready: /react-router-serve/,
    address: onLocalhost,
    peerAddress: false,
  },
  spa: {
    spec: "spa.spec.ts",
    apiUrlModule: "src/api-url.ts",
    build: ["npx", "vite", "build"],
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
    /* The page and the API share a host, as an application and its API on one domain do. */
    address: (port) => `http://127.0.0.1:${port}`,
  },
};
