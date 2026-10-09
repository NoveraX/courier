import { posix } from "node:path";

/**
 * How one file of the project imports another: the relative path between
 * them, without the TypeScript extension, with the extension the project's
 * module resolution asks for.
 *
 * @param from - The importing file, relative to the project's root
 * @param to - The imported file, relative to the project's root
 * @param extension - `.js` where TypeScript resolves modules as Node does, else nothing
 * @returns The specifier
 * @example
 * ```ts
 * importSpecifier("src/app/api/request/route.ts", "courier.config.ts", ""); // "../../../../courier.config"
 * ```
 */
export function importSpecifier(from: string, to: string, extension: "" | ".js"): string {
  const path = posix.relative(posix.dirname(from), to).replace(/\.(ts|tsx|mts)$/, "");
  return `${path.startsWith(".") ? path : `./${path}`}${extension}`;
}
