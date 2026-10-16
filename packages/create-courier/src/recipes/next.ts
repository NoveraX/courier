import { majorOf } from "../project/read-project";
import { attachesStudio } from "../project/wiring";
import { firstExisting } from "./edits/studio-browser";
import { importSpecifier } from "./import-specifier";
import { NEXT_CONFIGS, nextStudioEnvEdit, phaseHint, studioWrapper } from "./next-config-edit";
import type { ManualStep, Recipe, RecipeContext, RecipeEdit, RecipeFile } from "./recipe-types";
import { configPathOf, courierConfig, courierMocks } from "./shared/courier-config";
import { exampleApi } from "./shared/example-api";
import { devStep, routesStep, serverReach, studioStep } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { reactDemo, reactQuery } from "./shared/react-demo";
import { proxyScripts } from "./shared/recipe-parts";
import { addsExample, needsWhat, type ServerNeeds, servingFile, startFile } from "./shared/wired";

/* `src/` when the app router lives there, as create-next-app sets it up by default. */
function baseOf(ctx: RecipeContext): string {
  return ctx.project.exists("src/app") || (ctx.project.exists("src") && !ctx.project.exists("app"))
    ? "src/"
    : "";
}

/* `instrumentation.ts`: the APIs registered as the server starts, and the server connected to Studio while you develop — the parts still missing. */
function instrumentation(ctx: RecipeContext, base: string, needs: ServerNeeds): RecipeFile {
  const path = `${base}instrumentation.ts`;
  const config = importSpecifier(path, configPathOf(ctx), ctx.extension);
  const studio = needs.studio
    ? `
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "development") return;
  const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");
  await attachRuntime();`
    : "";
  const register = needs.register
    ? `
  const { default: config } = await import("${config}");
  registerSources(config.sources);`
    : "";
  const does = needs.register
    ? `registers the APIs courier.config.ts\n * lists, which the /api/request route serves${needs.studio ? ", and while you develop connects\n * the server to Courier Studio" : ""}`
    : "while you develop, connects the server\n * to Courier Studio";
  const content = `${needs.register ? 'import { registerSources } from "@noverax/courier";\n\n' : ""}/**
 * Runs once as the server starts: ${does}.
 */
export async function register() {${register}${studio}
}
`;
  return { path, content, purpose: "registers your APIs as the server starts" };
}

const BROWSER_STUDIO = `import { attachRuntime } from "@noverax/courier-studio-core/runtime";

/* Connects the browser to Courier Studio while you develop: the calls its pages make show there too. */
if (process.env.NODE_ENV === "development") {
  attachRuntime("next-browser");
}
`;

function route(base: string): RecipeFile {
  const content = `import { apiRoute } from "@noverax/courier-next";

/** Courier's proxy route: the browser calls your API through it. */
export const { GET, POST } = apiRoute();
`;
  return {
    path: `${base}app/api/request/route.ts`,
    content,
    purpose: "the route the browser calls your API through",
  };
}

/* The names an instrumentation file may have: in src/ or at the root, in TypeScript or JavaScript. */
function namesOf(path: string): string[] {
  return [path, path.replace(/^src\//, "")].flatMap((name) => [name, name.replace(/\.ts$/, ".js")]);
}

/* The browser's connection: Courier's file, the app's own where it connects already, or the lines to add to it. */
function browserPart(ctx: RecipeContext, file: RecipeFile): RecipeFile | ManualStep {
  const taken = namesOf(file.path).find((path) => ctx.project.exists(path));
  if (taken === undefined) return file;
  if (attachesStudio(ctx.project, taken)) return { ...file, path: taken, recognized: true };
  return {
    file: taken,
    what: "Connect the browser to Studio",
    lines: file.content.trimEnd().split("\n"),
  };
}

/*
 * Next.js 14 and 15 develop under webpack, which bundles the server's Studio
 * connection unless the config's wrapper keeps it out. `next start` loads the
 * config too, where Studio, a dev dependency, may not be installed: the
 * wrapper is imported by `next dev` alone.
 */
function wrapperStep(ctx: RecipeContext): ManualStep[] {
  const file = firstExisting(ctx.project, NEXT_CONFIGS);
  const wrapped = studioWrapper(ctx.project.read(file));
  if (wrapped === "dev-only") return [];
  if (wrapped === "always") return [phaseHint(file)];
  return [fullWrapper(ctx, file)];
}

function fullWrapper(ctx: RecipeContext, file: string): ManualStep {
  const commonJs = ctx.project.read(file)?.includes("module.exports") === true;
  const head = file.endsWith(".ts")
    ? "export default async function config(phase: string): Promise<NextConfig> {"
    : commonJs
      ? "module.exports = async function config(phase) {"
      : "export default async function config(phase) {";
  return {
    file,
    what: "Connect the browser to Studio while you develop, and keep its server connection out of webpack's bundle; `next dev` alone imports Studio, so `next start` runs without the dev dependency",
    lines: [
      head,
      /* Written out: an ES module config of Next.js 14 cannot import `next/constants`. */
      "  // PHASE_DEVELOPMENT_SERVER: next dev alone loads Studio, a dev dependency",
      '  if (phase !== "phase-development-server") return nextConfig;',
      '  const { withCourierStudio } = await import("@noverax/courier-studio/next");',
      "  return withCourierStudio()(nextConfig);",
      commonJs ? "};" : "}",
    ],
  };
}

/* The server's start, and Studio's connections where it is set up — each where the app lacks it. */
function wiring(ctx: RecipeContext, base: string): Array<RecipeFile | ManualStep | RecipeEdit> {
  const path = `${base}instrumentation.ts`;
  const server = startFile(
    ctx,
    (needs) => instrumentation(ctx, base, needs),
    needsWhat,
    namesOf(path).slice(1),
  );
  const parts = server === undefined ? [] : [server];
  if (!ctx.choices.studio) return parts;
  if ((majorOf(ctx.version) ?? 16) < 16) return [...parts, ...wrapperStep(ctx)];
  const browser = browserPart(ctx, {
    path: `${base}instrumentation-client.ts`,
    content: BROWSER_STUDIO,
    purpose: "the browser's connection to Studio",
  });
  return [...parts, browser, ...nextStudioEnvEdit(ctx)];
}

/**
 * Courier in a Next.js app: its API, registered from `instrumentation.ts`
 * as the server starts, the route the browser calls it through, a page
 * that shows it at work, and Studio connected from `instrumentation.ts`
 * and `instrumentation-client.ts` — or the lines to add where the app has
 * those files already.
 *
 * @param ctx - The project, and what is set up in it
 * @returns What setting Courier up takes
 * @example
 * ```ts
 * nextRecipe(ctx).files.map((file) => file.path);
 * ```
 */
export function nextRecipe(ctx: RecipeContext): Recipe {
  const base = baseOf(ctx);
  const dir = `${base}courier`;
  const example = addsExample(ctx);
  const proxy = servingFile(ctx, route(base), "@noverax/courier-next", "apiRoute");
  const parts = wiring(ctx, base);
  const page = {
    path: `${base}app/courier/page.tsx`,
    query: `${dir}/query.ts`,
    directive: '"use client";\n\n',
    variable: "API_URL",
  };
  return {
    files: [
      ...(example ? exampleApi(ctx, dir, serverReach(ctx)) : []),
      courierConfig(ctx, `${dir}/api.ts`),
      ...(example && ctx.choices.mocks ? [courierMocks(ctx, `${dir}/api.ts`)] : []),
      ...(proxy ? [proxy] : []),
      ...(example ? [reactQuery(ctx, dir, "proxy"), reactDemo(ctx, page)] : []),
      ...parts.filter((part): part is RecipeFile => "content" in part),
    ],
    edits: parts.filter((part): part is RecipeEdit => "change" in part),
    ...courierPackages(ctx, { adapter: "@noverax/courier-next", react: true, proxy: true }),
    scripts: proxyScripts(ctx),
    manual: parts.filter((part): part is ManualStep => "what" in part),
    next: [...studioStep(ctx), ...routesStep(ctx), devStep(ctx, example ? "/courier" : undefined)],
  };
}
