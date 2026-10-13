import { tsconfigChain } from "./tsconfig-chain";

/**
 * The extension the project's relative imports carry: `.js` where
 * TypeScript resolves modules as Node does — `node16` or `nodenext` —
 * which asks for it, and none where a bundler resolves them.
 *
 * @param root - The project's folder
 * @returns `.js` or nothing
 * @example
 * ```ts
 * importExtension("/work/api"); // ".js" under "module": "nodenext"
 * ```
 */
export function importExtension(root: string): "" | ".js" {
  const level = tsconfigChain(root).find(
    ({ options }) => typeof (options.moduleResolution ?? options.module) === "string",
  );
  const own = level?.options.moduleResolution ?? level?.options.module;
  const resolution = typeof own === "string" ? own.toLowerCase() : undefined;
  return resolution === "node16" || resolution === "nodenext" ? ".js" : "";
}
