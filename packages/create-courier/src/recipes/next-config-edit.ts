import { codeStyleOf, quoted } from "../edit/code-style";
import { appendItem } from "../edit/insert";
import { defaultExportLiteral, propertyLiteral } from "../edit/literal";
import { scanSource } from "../edit/source-scan";
import { STUDIO_DEFAULT_PORT } from "../project/ports";
import { firstExisting } from "./edits/studio-browser";
import type { RecipeContext, RecipeEdit } from "./recipe-types";

/* The config with `COURIER_STUDIO_URL` in its `env`, which it gets where it has none. */
function withStudioUrl(text: string, url: string): string | undefined {
  if (text.includes("COURIER_STUDIO_URL")) return text;
  const scan = scanSource(text);
  const config = scan === undefined ? undefined : defaultExportLiteral(scan, []);
  if (scan === undefined || config === undefined || text[config.open] !== "{") return undefined;
  const value = quoted(codeStyleOf(text), url);
  const env = propertyLiteral(scan, config, "env");
  if (env === null) return appendItem(scan, config, `env: { COURIER_STUDIO_URL: ${value} }`);
  if (env === undefined || text[env.open] !== "{") return undefined;
  return appendItem(scan, env, `COURIER_STUDIO_URL: ${value}`);
}

/**
 * Where Studio does not listen on its default port, the edit that tells
 * the browser where it does: a page's bundle cannot read courier.config.ts,
 * so the address goes in `next.config`'s `env`.
 *
 * @param ctx - The project, and what is set up in it
 * @returns The edit, or none while Studio has its default port
 * @example
 * ```ts
 * nextStudioEnvEdit(ctx); // [] on port 6280
 * ```
 */
export function nextStudioEnvEdit(ctx: RecipeContext): RecipeEdit[] {
  if (ctx.ports.studio === STUDIO_DEFAULT_PORT) return [];
  const url = `http://localhost:${ctx.ports.studio}`;
  const path = firstExisting(ctx.project, ["next.config.ts", "next.config.mjs", "next.config.js"]);
  return [
    {
      path,
      purpose: `tells the browser where Studio listens: port ${ctx.ports.studio}, as ${STUDIO_DEFAULT_PORT} was taken`,
      change: (text) => withStudioUrl(text, url),
      manual: {
        file: path,
        what: `Tell the browser where this project's Studio listens: port ${ctx.ports.studio}, as ${STUDIO_DEFAULT_PORT} was taken`,
        lines: [`env: { COURIER_STUDIO_URL: "${url}" },`],
      },
    },
  ];
}
