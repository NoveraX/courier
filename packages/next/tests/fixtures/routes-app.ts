import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/* The repository's packages of Courier, which an app's `@noverax/*` resolve to. */
const REPO_NOVERAX = resolve(import.meta.dirname, "../../../../node_modules/@noverax");

/** An app on disk for the plugin to read. */
export interface RoutesApp {
  readonly root: string;
  remove(): void;
}

/**
 * An app in a folder of its own: Courier's packages linked from the
 * repository, a `next` of the version given (its manifest alone, which is
 * what the plugin reads of it), a `courier.config.mjs`, and the files given.
 *
 * @param version - The version of Next.js the app builds with
 * @param files - More files, from the root, and their content
 * @returns The app
 * @example
 * ```ts
 * const app = routesApp("15.2.4");
 * ```
 */
export function routesApp(version = "16.4.4", files: Record<string, string> = {}): RoutesApp {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "courier-next-plugin-")));
  const write = (path: string, content: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  mkdirSync(join(root, "node_modules"));
  symlinkSync(REPO_NOVERAX, join(root, "node_modules/@noverax"), "dir");
  write("package.json", '{ "type": "module" }\n');
  write("node_modules/next/package.json", JSON.stringify({ name: "next", version }));
  write("courier.config.mjs", "export default { sources: {} };\n");
  for (const [path, content] of Object.entries(files)) write(path, content);
  return { root, remove: () => rmSync(root, { recursive: true, force: true }) };
}
