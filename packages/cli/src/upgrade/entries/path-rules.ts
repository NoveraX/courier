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

/**
 * What a framework whose rules read a piece's path, and its directive at
 * most, says of it: Nuxt's, SvelteKit's, SolidStart's, Expo's, an SPA's
 * with Vite, a page's Vite builds beside a server — by the modules it
 * starts from, whatever framework builds it — and a server framework's,
 * every file of which is the server's.
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
    case "react":
    case "vue":
    case "vite":
      if (framework.pageEntries !== undefined) return framework.pageEntries.has(path) ? PAGE : NONE;
      return path.startsWith("src/") ? PAGE : NONE;
    default:
      return id !== undefined && SERVERS.has(id) ? SERVER : NONE;
  }
}
