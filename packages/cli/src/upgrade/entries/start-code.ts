/** What TanStack Start keeps of a module to one side as it builds: server functions, and a route of server handlers alone, it takes out of a page; a module that imports a marker of one side, or Start's server helpers, its import protection keeps to that side. */
export type StartCode = "server-functions" | "server-route" | "server-only" | "client-only";

/** An import of a module, as oxc's record of the module gives it. */
interface Imported {
  readonly moduleRequest: { readonly value: string };
  readonly entries: ReadonlyArray<{
    readonly isType: boolean;
    readonly importName: { readonly name?: string | null | undefined };
  }>;
}

/** The packages Start's compiler takes its functions from, as Start 1.169 knows them: `createServerFn`, `createIsomorphicFn` and the rest. */
export const START_PACKAGES =
  /^@tanstack\/(?:(?:react|solid|vue)-start|start-client-core|start-fn-stubs)$/;
/** TanStack Router's packages, whose routes Start's are and whose `ClientOnly` its compiler reads. */
export const ROUTER_PACKAGES = /^@tanstack\/(?:react|solid|vue)-router$/;
/* The markers Start's import protection keeps a module to one side by, its server functions, and the routes whose server, ssr and headers its router takes out of a page. */
const MARKER = /^@tanstack\/(?:react|solid|vue)-start\/(server-only|client-only|server)$/;
const SERVER_FUNCTIONS = new Set(["createServerFn", "createServerOnlyFn"]);
const ROUTES = new Set(["createFileRoute", "createRootRoute", "createRootRouteWithContext"]);
/* A route's options that give it server handlers and no component: the browser's route keeps neither. */
const SERVER_KEY = /\bserver\s*:/;
const HANDLERS = /\bhandlers\b/;
const COMPONENT = /\bcomponent\b/;

/* Whether a module imports one of some names from a package of a kind, as values. */
function takes(imports: readonly Imported[], from: RegExp, names: ReadonlySet<string>): boolean {
  return imports.some(
    ({ moduleRequest, entries }) =>
      from.test(moduleRequest.value) &&
      entries.some((entry) => !entry.isType && names.has(entry.importName.name ?? "")),
  );
}

/**
 * What TanStack Start 1.169 keeps of a module to one side as it builds,
 * by what the module imports and writes:
 * - a module that imports `@tanstack/<fw>-start/server-only`, or Start's
 *   server helpers at `@tanstack/<fw>-start/server`, the server's, and
 *   one of `client-only` the page's — its import protection fails a
 *   build that takes either to the other side;
 * - one that takes `createServerFn` or `createServerOnlyFn` of Start's,
 *   its server functions, whose code its compiler takes out of a page;
 * - a route — one that takes `createFileRoute`, `createRootRoute` or
 *   `createRootRouteWithContext` of TanStack Router's — with server
 *   handlers and no component, whose handlers the browser's route does
 *   not keep.
 *
 * @param imports - The module's imports of values, as oxc's record of it gives them
 * @param text - Its text
 * @returns What Start keeps of it to one side; none for a module both take
 * @example
 * ```ts
 * startCodeOf(parsed.module.staticImports, text); // "server-functions"
 * ```
 */
export function startCodeOf(imports: readonly Imported[], text: string): StartCode | undefined {
  for (const { moduleRequest } of imports) {
    const marker = MARKER.exec(moduleRequest.value)?.[1];
    if (marker !== undefined) return marker === "client-only" ? "client-only" : "server-only";
  }
  if (takes(imports, START_PACKAGES, SERVER_FUNCTIONS)) return "server-functions";
  const route = takes(imports, ROUTER_PACKAGES, ROUTES);
  return route && SERVER_KEY.test(text) && HANDLERS.test(text) && !COMPONENT.test(text)
    ? "server-route"
    : undefined;
}
