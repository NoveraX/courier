import { packageFile } from "../util/package-file";

/**
 * The loader this package ships, as webpack, Rspack and Turbopack load it:
 * a CommonJS module, by its absolute path.
 *
 * @returns The loader file
 * @throws Error when the package's own folder cannot be found
 * @example
 * ```ts
 * routesLoaderFile(); // "/app/node_modules/@noverax/courier-build/lib/webpack/loader.cjs"
 * ```
 */
export function routesLoaderFile(): string {
  const file = packageFile("lib/webpack/loader.cjs");
  if (file === undefined) {
    throw new Error(
      "[courier] @noverax/courier-build cannot find the folder it is installed in: install it again.",
    );
  }
  return file;
}
