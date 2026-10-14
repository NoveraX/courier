import { majorOf } from "../project/read-project";
import { firstExisting } from "./edits/studio-browser";
import { importSpecifier } from "./import-specifier";
import { nextStudioEnvEdit } from "./next-config-edit";
import type { ManualStep, Recipe, RecipeContext, RecipeEdit, RecipeFile } from "./recipe-types";
import { courierConfig, courierMocks } from "./shared/courier-config";
import { exampleApi } from "./shared/example-api";
import { devStep, routesStep, serverReach, studioStep } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { reactDemo, reactQuery } from "./shared/react-demo";
import { proxyScripts } from "./shared/recipe-parts";

/* `src/` when the app router lives there, as create-next-app sets it up by default. */
function baseOf(ctx: RecipeContext): string {
  return ctx.project.exists("src/app") || (ctx.project.exists("src") && !ctx.project.exists("app"))
    ? "src/"
    : "";
}

/* `instrumentation.ts`: the APIs registered as the server starts, and the server connected to Studio while you develop. */
function instrumentation(ctx: RecipeContext, base: string): RecipeFile {
  const path = `${base}instrumentation.ts`;
  const config = importSpecifier(path, "courier.config.ts", ctx.extension);
  const studio = ctx.choices.studio
    ? `
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "development") return;
  const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");
  await attachRuntime();`
    : "";
  const content = `import { registerSources } from "@noverax/courier";

/**
 * Runs once as the server starts: registers the APIs courier.config.ts
 * lists, which the /api/request route serves${ctx.choices.studio ? ", and while you develop connects\n * the server to Courier Studio" : ""}.
 */
export async function register() {
  const { default: config } = await import("${config}");
  registerSources(config.sources);${studio}
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

/* A file of Courier's own, or, where the app has one of that name, the lines to add to it. */
function ownOrManual(ctx: RecipeContext, file: RecipeFile, what: string): RecipeFile | ManualStep {
  const names = [file.path, file.path.replace(/^src\//, "")].flatMap((path) => [
    path,
    path.replace(/\.ts$/, ".js"),
  ]);
  const taken = names.find((path) => ctx.project.exists(path));
  return taken === undefined
    ? file
    : { file: taken, what, lines: file.content.trimEnd().split("\n") };
}

/*
 * Next.js 14 and 15 develop under webpack, which bundles the server's Studio
 * connection unless the config's wrapper keeps it out. `next start` loads the
 * config too, where Studio, a dev dependency, may not be installed: the
 * wrapper is imported by `next dev` alone.
 */
function wrapperStep(ctx: RecipeContext): ManualStep {
  const file = firstExisting(ctx.project, ["next.config.ts", "next.config.mjs", "next.config.js"]);
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

/* The server's start, and Studio's connections where it is set up. */
function wiring(ctx: RecipeContext, base: string): Array<RecipeFile | ManualStep | RecipeEdit> {
  const what = ctx.choices.studio
    ? "Register Courier's APIs as the server starts, and connect it to Studio while you develop"
    : "Register Courier's APIs as the server starts";
  const server = ownOrManual(ctx, instrumentation(ctx, base), what);
  if (!ctx.choices.studio) return [server];
  if ((majorOf(ctx.version) ?? 16) < 16) return [server, wrapperStep(ctx)];
  const browser = ownOrManual(
    ctx,
    {
      path: `${base}instrumentation-client.ts`,
      content: BROWSER_STUDIO,
      purpose: "the browser's connection to Studio",
    },
    "Connect the browser to Studio",
  );
  return [server, browser, ...nextStudioEnvEdit(ctx)];
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
  const example = ctx.choices.openapi === undefined;
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
      route(base),
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
