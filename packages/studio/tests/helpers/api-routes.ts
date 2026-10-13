import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SERVER = join(import.meta.dirname, "../../src/server");
/* A route registered by its path as written, in any quotes: `app.post("/api/…"`. */
const REGISTERED = /\bapp\.(?:get|post|put|patch|delete|all)\(\s*(["'`])(\/api[^"'`]*)\1/g;
/* A route registered by anything but a path as written — a constant, say — which no scan reads. */
const UNREAD = /\bapp\.(?:get|post|put|patch|delete|all)\(\s*(?!["'`])/g;

function serverFiles(): Array<{ file: string; text: string }> {
  return readdirSync(SERVER, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({ file, text: readFileSync(join(SERVER, file), "utf8") }));
}

/**
 * Every API route Studio's server registers, read from its source: each
 * `app.post("/api/…")`, `app.get("/api/…")` and the like, in whichever file
 * mounts it.
 *
 * @returns The routes' paths, each once, sorted
 */
export function registeredApiRoutes(): string[] {
  const routes = new Set<string>();
  for (const { text } of serverFiles()) {
    for (const [, , path] of text.matchAll(REGISTERED)) {
      if (path !== undefined) routes.add(path);
    }
  }
  return [...routes].sort();
}

/**
 * The files of Studio's server that register a route by anything but its
 * path as written, which {@link registeredApiRoutes} cannot read.
 *
 * @returns The files, relative to the server's folder, sorted
 */
export function filesRegisteringUnreadRoutes(): string[] {
  return serverFiles()
    .filter(({ text }) => [...text.matchAll(UNREAD)].length > 0)
    .map(({ file }) => file)
    .sort();
}
