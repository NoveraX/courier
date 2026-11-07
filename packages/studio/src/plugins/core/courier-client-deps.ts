import { createRequire } from "node:module";
import { join, resolve } from "node:path";

/** Courier's modules a page imports: the callers, from the root or the page's entry, an API defined for a direct caller, the React hooks. */
const CLIENT_MODULES = [
  "@noverax/courier",
  "@noverax/courier/client",
  "@noverax/courier/define",
  "@noverax/courier-react",
] as const;

/**
 * Courier's browser modules the app has installed, for Vite to pre-bundle
 * as the dev server starts. Found only on the first page that imports
 * them — a route of React Router's, which Vite does not crawl ahead — they
 * made Vite pre-bundle again and send the page a reload, which a page
 * whose client had not connected yet never received, and it stayed
 * unhydrated.
 *
 * @param root - Vite's root, or where it was started
 * @returns The modules that resolve from the app
 * @example
 * ```ts
 * courierClientDeps("/work/shop"); // ["@noverax/courier", "@noverax/courier/client", …]
 * ```
 */
export function courierClientDeps(root: string): string[] {
  const require = createRequire(join(resolve(root), "package.json"));
  return CLIENT_MODULES.filter((module) => {
    try {
      require.resolve(module);
      return true;
    } catch {
      /* Not installed in the app: nothing of it reaches a page. */
      return false;
    }
  });
}
