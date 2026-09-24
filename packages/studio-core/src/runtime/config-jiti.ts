import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Jiti, JitiOptions } from "jiti";
import { readPathAliases } from "./path-aliases";
import type { TransformCache } from "./transform-cache";

/** How a project-file loader resolves imports and transforms modules. */
export interface ConfigJitiOptions {
  /**
   * Whether imports resolve through the project's tsconfig path aliases, as
   * the project's own files expect. Off to load an installed package as it is:
   * an alias of its scope would send its imports to project sources.
   */
  aliases?: boolean;
  /**
   * Where to reuse each module's transform while its bytes are unchanged.
   * Without one, every module is transformed on every load. Aliases take no
   * part in it: they change where an import resolves, never the code a
   * module's own bytes transform to.
   */
  transformCache?: TransformCache;
}

type CreateJiti = (id: string, options?: JitiOptions) => Jiti;
type Transform = NonNullable<JitiOptions["transform"]>;

let ownTransform: Transform | undefined;

/* An instance created without a transform carries jiti's own. It depends
   only on the options it is handed, never on the instance's file or aliases,
   so one serves every file; and its result keeps a failed transform's
   `error`, which the loading instance reports under JITI_DEBUG. */
function jitiOwnTransform(createJiti: CreateJiti): Transform {
  if (ownTransform) return ownTransform;
  const id = fileURLToPath(import.meta.url);
  const { transform } = createJiti(id, { fsCache: false, moduleCache: false }).options;
  if (!transform) throw new Error("jiti created an instance without its own transform");
  ownTransform = transform;
  return transform;
}

/**
 * The module loader for Courier's project files — `courier.config.*` and
 * `courier.mocks.*` — with the options both need: the project's tsconfig path
 * aliases, default-export interop, and no module cache.
 *
 * The module cache is off because this is also the reload path: the dev
 * server loads the files again on every edit, and a cached module would hand
 * back the file as it was before the user changed it. Every load therefore
 * reads and evaluates every file again; a `transformCache` only spares the
 * transform of a file whose bytes are unchanged.
 *
 * jiti's own file cache stays off, with or without a `transformCache`:
 * - it writes each entry in place, so concurrent writers can leave an entry
 *   torn between two transforms that its check still accepts;
 * - an entry it cannot write makes the whole load throw `EACCES`;
 * - unless the file's own directory has a `node_modules`, it falls back to
 *   `os.tmpdir()/jiti`, where another user of the machine can place an entry
 *   that is then run;
 * - its key ignores `interopDefault` and the babel options, so a transform
 *   made under other options can be handed back;
 * - nothing ever prunes it.
 *
 * jiti is loaded here rather than at the top of a module so a bundler that
 * merely reaches this code does not pull a TypeScript transpiler into its
 * graph; only a process that actually reads such a file pays for it.
 *
 * @param file - Absolute, symlink-resolved path of the file to load; modules
 *   and aliases resolve from its directory
 * @param options - Whether to resolve through the project's path aliases
 *   (default: yes), and where to reuse transforms (default: nowhere)
 * @returns A jiti instance for that file
 * @example
 * ```ts
 * const transformCache = createTransformCache();
 * const jiti = await createConfigJiti(configFile, { transformCache });
 * const config = await jiti.import(configFile, { default: true });
 * ```
 */
export async function createConfigJiti(
  file: string,
  { aliases = true, transformCache }: ConfigJitiOptions = {},
): Promise<Jiti> {
  const { createJiti } = await import("jiti");
  const options: JitiOptions = {
    alias: aliases ? readPathAliases(dirname(file)).loader : {},
    interopDefault: true,
    moduleCache: false,
    fsCache: false,
  };
  if (!transformCache) return createJiti(file, options);
  const compute = jitiOwnTransform(createJiti);
  const transform: Transform = (transformOptions) =>
    transformCache.transform(transformOptions, compute);
  return createJiti(file, { ...options, transform });
}
