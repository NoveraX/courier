import { join } from "node:path";

/** The key of the app's `package.json` the transformer's options are under, as Parcel's own plugins take theirs. */
export const OPTIONS_KEY = "@noverax/parcel-transformer-courier";

/** The transformer's options. */
export interface ParcelRoutesOptions {
  /**
   * The config file, from the folder Parcel runs in or absolute, when it is
   * not the `courier.config.*` there or in the nearest folder above it.
   */
  readonly config?: string | undefined;
}

/** What of Parcel's config search the options are read with. */
export interface OptionsSearch {
  getConfigFrom<T>(
    searchPath: string,
    filePaths: string[],
    options?: { packageKey?: string },
  ): Promise<{ contents: T } | null | undefined>;
}

/**
 * The transformer's options, from the nearest `package.json` of the folder
 * Parcel runs in, under {@link OPTIONS_KEY}. Parcel follows that file, and
 * reads them again when it changes.
 *
 * @param search - Parcel's config search, as `loadConfig` hands it
 * @param root - The folder Parcel runs in
 * @returns The options; none when the key is not there
 * @example
 * ```ts
 * loadConfig: ({ config }) => routesOptionsOf(config, process.cwd()),
 * ```
 */
export async function routesOptionsOf(
  search: OptionsSearch,
  root: string,
): Promise<ParcelRoutesOptions> {
  const found = await search.getConfigFrom<unknown>(join(root, "package.json"), ["package.json"], {
    packageKey: OPTIONS_KEY,
  });
  const contents = found?.contents;
  if (typeof contents !== "object" || contents === null) return {};
  const config: unknown = Reflect.get(contents, "config");
  return typeof config === "string" ? { config } : {};
}
