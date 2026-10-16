import { codeMatches, scanSource } from "../edit/source-scan";

const EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;

/** What React Router's routes file lists. */
export interface RouteList {
  /** Whether it reads the routes from the folder, with `flatRoutes()`. */
  readonly fromFolder: boolean;
  /** The route modules it names, relative to `app/`, without `./` or extension. */
  readonly modules: ReadonlySet<string>;
  /** The URL paths its `route()` calls give, without their slashes at either end. */
  readonly paths: ReadonlySet<string>;
}

/**
 * A route module's path as the routes file may write it, made one form:
 * relative to `app/`, without a leading `./` and without its extension.
 *
 * @param path - `./routes/api.request.ts`, `routes/api.request`
 * @returns `routes/api.request`
 * @example
 * ```ts
 * routeModule("./routes/api.request.ts"); // "routes/api.request"
 * ```
 */
export function routeModule(path: string): string {
  return path.replace(/^(?:\.\/)+/, "").replace(EXTENSION, "");
}

/**
 * What a React Router routes file lists, read from its code: whether it
 * reads the folder, each module its strings name, and each URL path a
 * `route()` call gives — a string in a comment counts for none.
 *
 * @param text - The routes file
 * @returns What it lists, or `undefined` where its brackets do not pair
 * @example
 * ```ts
 * routeList('export default [route("api/request", "./routes/api.request.ts")];')?.paths.has("api/request"); // true
 * ```
 */
export function routeList(text: string): RouteList | undefined {
  const scan = scanSource(text);
  if (scan === undefined) return undefined;
  const strings = [...text.matchAll(/(["'`])([^"'`\n]+)\1/g)].filter(
    (match) => scan.literal[match.index] === 1,
  );
  const calls = codeMatches(scan, /\broute\s*\(\s*(["'`])([^"'`\n]*)\1/g);
  return {
    fromFolder: codeMatches(scan, /\bflatRoutes\s*\(/g).length > 0,
    modules: new Set(strings.map((match) => routeModule(match[2] ?? ""))),
    paths: new Set(calls.map((match) => (match[2] ?? "").replace(/^\/+|\/+$/g, ""))),
  };
}
