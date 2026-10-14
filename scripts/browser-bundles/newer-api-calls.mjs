import { NEWER_APIS } from "./newer-apis.mjs";

/**
 * The calls of newer APIs in a bundle that their module does not check for
 * first. A check is `typeof` on the API, optional chaining onto it — not
 * through it, as `headers?.getSetCookie()` calls it on any headers — or an
 * optional call of it.
 *
 * @param {string} text - The bundle, unminified, its modules marked as esbuild marks them
 * @returns {{ module: string, api: string, lacking: string }[]} One entry per module and API
 * @example
 * newerApiCalls("// packages/core/lib/a.js\nURL.canParse(x);"); // [{ module: "core/lib/a.js", api: "URL.canParse", … }]
 */
export function newerApiCalls(text) {
  const found = [];
  for (const part of text.split(/^\/\/ (?=\S+\.m?js$)/m)) {
    const module = (part.split("\n", 1)[0] ?? "").replace(/^.*?packages\//, "");
    const code = part.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
    for (const api of NEWER_APIS) {
      if (!api.find.test(code)) continue;
      const checked = new RegExp(
        `typeof [\\w$.?]*\\b(?:${api.guard})\\b|\\?\\.(?:${api.guard})\\b(?!\\()|\\b(?:${api.guard})\\?\\.\\(`,
      );
      if (!checked.test(code)) found.push({ module, api: api.name, lacking: api.lacking });
    }
  }
  return found;
}
