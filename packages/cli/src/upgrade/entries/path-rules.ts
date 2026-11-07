import { SERVER_FRAMEWORKS } from "@noverax/create-courier/engine";

import type {
  PackageFramework,
  PackageFrameworkId,
  PieceFacts,
  PieceRoots,
} from "./framework-roots";
import { BOTH, NONE, PAGE, SERVER, SPLIT } from "./root-kinds";

/** A file a framework gives the server by its name: `*.server.*`. */
export const SERVER_NAMED = /(?:^|\/)[^/]+\.server\.[^/]+$/;
/** A file a framework gives a page by its name: `*.client.*`. */
export const CLIENT_NAMED = /(?:^|\/)[^/]+\.client\.[^/]+$/;

const NUXT_PAGE =
  /^(?:app\/)?(?:(?:pages|components|layouts|composables|plugins|middleware|utils)\/|(?:app|error)\.vue$)/;
const KIT_SERVER =
  /^src\/(?:routes\/(?:.*\/)?\+(?:(?:page|layout)\.server\.|server\.)|hooks\.server\.|lib\/server\/)/;
const KIT_PAGE = /^src\/(?:routes\/|lib\/|hooks\.client\.)/;
const KIT_BOTH = /^src\/hooks\.[cm]?[jt]sx?$/;
const SOLID_ENTRY = /^src\/entry-(server|client)\.[cm]?[jt]sx?$/;
/* What Expo Router runs on the server alone, by SDK 58's docs: an API route, the HTML a page is rendered into, the middleware. */
const EXPO_SERVER = /(?:\+api|(?:^|\/)\+(?:html|middleware))\.[cm]?[jt]sx?$/;
/* What a route module exports that the server runs and the app's bundle drops. */
const EXPO_SERVER_EXPORTS = new Set(["loader", "generateMetadata", "generateStaticParams", "*"]);
const EXPO_ENTRY = /^(?:App|index)\.[cm]?[jt]sx?$/;
/* TanStack Start's entries in its `src`, as Start 1.169 resolves them: the server's, the client's, and the router and the start both load. */
const START_ENTRY = /^src\/(server|client|router|start)\.(?:m?[jt]s|[jt]sx)$/;
/* TanStack Start's routes, as its router's generator finds them: a file of `src/routes/` of its extensions, none of whose folders or name starts with `-` or `.`. */
const START_ROUTE = /^src\/routes\/(?:[^/.-][^/]*\/)*[^/.-][^/]*\.[jt]sx?$/;
/** TanStack Start's: its build keeps a module to one side by its name and the markers it imports, and takes server functions and a route's server handlers out of a page. */
export const START: ReadonlySet<PackageFrameworkId> = new Set([
  "tanstack-start-react",
  "tanstack-start-solid",
]);
/** The frameworks that run a server alone: create-courier's list, which Studio's is held to. */
export const SERVERS: ReadonlySet<PackageFrameworkId> = new Set(
  SERVER_FRAMEWORKS.map(({ id }) => id),
);

/* Expo Router's: a route the server alone runs, one whose loader it runs beside the screen the app shows, a screen; and the app's own start. */
function expo(framework: PackageFramework, facts: PieceFacts): PieceRoots {
  const routes = `${framework.routes ?? "app"}/`;
  if (facts.path.startsWith(routes)) {
    if (EXPO_SERVER.test(facts.path.slice(routes.length))) return SERVER;
    const exports = facts.exports;
    const loads = exports === undefined || exports.some((name) => EXPO_SERVER_EXPORTS.has(name));
    return loads ? SPLIT : PAGE;
  }
  const bare = facts.path.replace(/\.[^./]+$/, "");
  return EXPO_ENTRY.test(facts.path) || bare === framework.main ? PAGE : NONE;
}

/* TanStack Start's, by its build: the server's entry, and what its import protection keeps out of a page — `*.server.*`, a module of `server-only` or of Start's server helpers — or its compiler takes out of one — a route of server handlers alone, a module of server functions; the client's entry and `*.client.*` a page's; the router, the start, the route tree and every other route its generator finds both sides'. */
function tanstackStart(facts: PieceFacts): PieceRoots {
  const { path, startCode } = facts;
  if (SERVER_NAMED.test(path) || startCode === "server-only") return SERVER;
  if (CLIENT_NAMED.test(path) || startCode === "client-only") return PAGE;
  const entry = START_ENTRY.exec(path)?.[1];
  if (entry === "server") return SERVER;
  if (entry === "client") return PAGE;
  if (entry !== undefined || path === "src/routeTree.gen.ts") return BOTH;
  if (START_ROUTE.test(path)) return startCode === "server-route" ? SERVER : BOTH;
  return startCode === "server-functions" ? SERVER : NONE;
}

/**
 * Whether TanStack Start's router reads a file as a route: one of
 * `src/routes/` its generator finds, whose `server`, `ssr` and `headers`
 * Start's build of a page takes out of it.
 *
 * @param framework - The file's framework
 * @param path - The file, as its package names it
 * @returns Whether it is one
 * @example
 * ```ts
 * isStartRoute("tanstack-start-react", "src/routes/-lib/users.ts"); // false
 * ```
 */
export function isStartRoute(framework: PackageFrameworkId | undefined, path: string): boolean {
  return framework !== undefined && START.has(framework) && START_ROUTE.test(path);
}

/**
 * What a framework whose rules read a piece's path, and its directive at
 * most, says of it: Nuxt's, SvelteKit's, SolidStart's, Expo's, TanStack
 * Start's, an SPA's with Vite, a page's Vite builds beside a server — by
 * the modules it starts from, whatever framework builds it — and a
 * server framework's, every file of which is the server's.
 *
 * @param framework - The package's framework
 * @param facts - The piece
 * @returns Its roots
 * @example
 * ```ts
 * byPath({ id: "sveltekit" }, { path: "src/hooks.server.ts", kind: "module", directive: undefined, exportsDefault: false }).server; // true
 * ```
 */
export function byPath(framework: PackageFramework, facts: PieceFacts): PieceRoots {
  const { id } = framework;
  const { path } = facts;
  switch (id) {
    case "nuxt":
      if (SERVER_NAMED.test(path) || path.startsWith("server/")) return SERVER;
      if (path.startsWith("shared/")) return BOTH;
      return NUXT_PAGE.test(path) ? PAGE : NONE;
    case "sveltekit":
      if (SERVER_NAMED.test(path) || KIT_SERVER.test(path)) return SERVER;
      if (KIT_BOTH.test(path)) return BOTH;
      return KIT_PAGE.test(path) ? PAGE : NONE;
    case "solid-start": {
      const entry = SOLID_ENTRY.exec(path)?.[1];
      if (facts.directive === "use server" || entry === "server") return SERVER;
      if (entry === "client") return PAGE;
      /* An API route exports its HTTP methods and no page: the server's, as React Router's resource route. */
      if (path.startsWith("src/routes/")) return facts.exportsDefault ? SPLIT : SERVER;
      return /^src\/app\./.test(path) ? SPLIT : NONE;
    }
    case "expo":
      return expo(framework, facts);
    case "tanstack-start-react":
    case "tanstack-start-solid":
      return tanstackStart(facts);
    case "react":
    case "vue":
    case "vite":
      if (framework.pageEntries !== undefined) return framework.pageEntries.has(path) ? PAGE : NONE;
      return path.startsWith("src/") ? PAGE : NONE;
    default:
      return id !== undefined && SERVERS.has(id) ? SERVER : NONE;
  }
}
