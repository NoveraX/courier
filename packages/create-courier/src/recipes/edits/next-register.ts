import { codeMatches, scanSource } from "../../edit/source-scan";
import { importSpecifier } from "../import-specifier";
import type { RecipeContext } from "../recipe-types";
import { configPathOf } from "../shared/courier-config";
import { needsWhat, type ServerNeeds } from "../shared/wired";

/* `register` declared in code: a function, or a function given the name. */
const REGISTER = /\bfunction\s+register\b|\bregister\s*=\s*(?:async\b|\(|function\b)/g;
const ASYNC = /\basync\s+function\s+register\b|\bregister\s*=\s*async\b/g;

/**
 * Where a Next.js app's `instrumentation.ts` has its `register()` already,
 * the lines the parts it lacks take in it: the import at the top, and the
 * rest inside the function — Studio's connection behind a check, so the
 * function's own code after it still runs.
 *
 * @param ctx - The project, and what is set up in it
 * @param path - The app's instrumentation file
 * @param needs - What the server's start lacks
 * @param text - The file
 * @returns The step's sentence and lines, or `undefined` where the file has no `register()`
 * @example
 * ```ts
 * registerInside(ctx, "instrumentation.ts", { register: false, studio: true }, text);
 * ```
 */
export function registerInside(
  ctx: RecipeContext,
  path: string,
  needs: ServerNeeds,
  text: string,
): { what: string; lines: string[] } | undefined {
  const scan = scanSource(text);
  if (scan === undefined || codeMatches(scan, REGISTER).length === 0) return undefined;
  const config = importSpecifier(path, configPathOf(ctx), ctx.extension);
  const lines = [
    ...(needs.register ? ['import { registerSources } from "@noverax/courier";', ""] : []),
    "// inside register():",
    ...(needs.register
      ? [
          `const { default: config } = await import("${config}");`,
          "registerSources(config.sources);",
        ]
      : []),
    ...(needs.studio
      ? [
          'if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "development") {',
          '  const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");',
          "  await attachRuntime();",
          "}",
        ]
      : []),
  ];
  const where = needs.register ? "the import at the top, the rest" : "these lines";
  const awaits = codeMatches(scan, ASYNC).length > 0 ? "" : ", made async: the lines await";
  return { what: `${needsWhat(needs)}: ${where} inside the register() it exports${awaits}`, lines };
}
