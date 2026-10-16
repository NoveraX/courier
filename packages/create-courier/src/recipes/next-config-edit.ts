import { codeStyleOf, quoted } from "../edit/code-style";
import { importsOf, type ModuleImport, usesExport } from "../edit/imports";
import { appendItem } from "../edit/insert";
import { defaultExportLiteral, propertyLiteral } from "../edit/literal";
import { codeMatches, type SourceScan, scanSource } from "../edit/source-scan";
import { STUDIO_DEFAULT_PORT } from "../project/ports";
import { firstExisting } from "./edits/studio-browser";
import type { ManualStep, RecipeContext, RecipeEdit } from "./recipe-types";

/** The names a Next.js config may have, in the order Next.js looks for them. */
export const NEXT_CONFIGS = ["next.config.ts", "next.config.mjs", "next.config.js"];

const STUDIO_NEXT = (specifier: string) => specifier === "@noverax/courier-studio/next";

/* The config with `COURIER_STUDIO_URL` in its `env`, which it gets where it has none. */
function withStudioUrl(text: string, url: string): string | undefined {
  const scan = scanSource(text);
  if (scan && codeMatches(scan, /\bCOURIER_STUDIO_URL\b/g).length > 0) return text;
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
  const path = firstExisting(ctx.project, NEXT_CONFIGS);
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

/* Where the config first checks for `next dev` — its phase, or the environment it runs in — outside its imports; -1 where it never does. */
function phaseCheck(scan: SourceScan, imports: readonly ModuleImport[]): number {
  const named = codeMatches(scan, /\bPHASE_DEVELOPMENT_SERVER\b|\bprocess\.env\.NODE_ENV\b/g)
    .map((match) => match.index)
    .filter((at) => !imports.some((each) => each.start <= at && at < each.end));
  const written = [...scan.text.matchAll(/(["'`])phase-development-server\1/g)]
    .filter((match) => scan.literal[match.index] === 1)
    .map((match) => match.index);
  const all = [...named, ...written];
  return all.length === 0 ? -1 : Math.min(...all);
}

/**
 * How a Next.js config connects Studio: `withCourierStudio` called, and
 * loaded only once the config has checked it runs under `next dev` — by
 * its phase, or by `NODE_ENV` — so `next start` never needs Studio, a dev
 * dependency; or loaded whatever the command. A config that names it
 * only in a comment or a string does not connect it.
 *
 * @param text - The config
 * @returns `dev-only`, `always`, or `undefined` where the config does not connect Studio
 * @example
 * ```ts
 * studioWrapper('const { withCourierStudio } = require("@noverax/courier-studio/next");\nmodule.exports = withCourierStudio()({});'); // "always"
 * ```
 */
export function studioWrapper(text: string | undefined): "dev-only" | "always" | undefined {
  const scan = text === undefined ? undefined : scanSource(text);
  if (scan === undefined) return undefined;
  const imports = importsOf(scan);
  if (!usesExport(scan, imports, STUDIO_NEXT, "withCourierStudio", true)) return undefined;
  const check = phaseCheck(scan, imports);
  const loads = imports.filter((each) => STUDIO_NEXT(each.specifier));
  return check !== -1 && loads.every((each) => !each.static && each.start > check)
    ? "dev-only"
    : "always";
}

/**
 * The step for a config that connects Studio whatever the command: the
 * lines that load it under `next dev` alone, rather than the wrapper again.
 *
 * @param file - The config
 * @returns The step
 * @example
 * ```ts
 * phaseHint("next.config.js").lines[0]; // 'if (phase !== "phase-development-server") return nextConfig;'
 * ```
 */
export function phaseHint(file: string): ManualStep {
  return {
    file,
    what: "Studio is connected here, but loaded whatever the command, so `next start` needs Studio, a dev dependency: load it in the config's function, which Next.js calls with the phase, under `next dev` alone",
    lines: [
      'if (phase !== "phase-development-server") return nextConfig;',
      'const { withCourierStudio } = await import("@noverax/courier-studio/next");',
    ],
  };
}
