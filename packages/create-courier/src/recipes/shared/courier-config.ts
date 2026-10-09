import { STUDIO_DEFAULT_PORT } from "../../project/ports";
import { importSpecifier } from "../import-specifier";

import type { RecipeContext, RecipeFile } from "../recipe-types";

/** How the config and the mocks name the example API: its module's `api`, or one `createApi` builds. */
export interface ExampleSource {
  /** The export imported. */
  readonly name: "api" | "createApi";
  /** The expression that gives the API. */
  readonly expression: string;
}

const PLAIN: ExampleSource = { name: "api", expression: "api" };

/**
 * The example API built for Studio, where its module exports a factory:
 * at the mock's address, which Studio runs.
 *
 * @param ctx - The project, and what is set up in it
 * @returns How the config and the mocks name it
 * @example
 * ```ts
 * builtSource(ctx).expression; // 'createApi("http://localhost:7001")'
 * ```
 */
export function builtSource(ctx: RecipeContext): ExampleSource {
  return { name: "createApi", expression: `createApi("http://localhost:${ctx.ports.mock}")` };
}

/* Studio's port, where the default was taken when the project was set up. */
function studioBlock(ctx: RecipeContext): string {
  return ctx.ports.studio === STUDIO_DEFAULT_PORT
    ? ""
    : `\n  studio: { port: ${ctx.ports.studio} },`;
}

/**
 * `courier.config.ts`, the one list of the APIs the project calls: the
 * app's server route registers them from it, and Studio and the MCP server
 * read them there. With a specification to import it starts empty, and the
 * import declares the API in it.
 *
 * @param ctx - The project, and what is set up in it
 * @param api - The example API's module, relative to the root
 * @param source - How the module gives the API
 * @returns The file
 * @example
 * ```ts
 * courierConfig(ctx, "src/courier/api.ts");
 * ```
 */
export function courierConfig(
  ctx: RecipeContext,
  api: string,
  source: ExampleSource = PLAIN,
): RecipeFile {
  const purpose = "lists your APIs for the app, Studio and agents";
  if (ctx.choices.openapi !== undefined) {
    const content = `import { defineConfig } from "@noverax/courier/config";

/** The APIs this project calls. Courier's server route registers them from here, and Studio reads them. */
export default defineConfig({
  sources: {},${studioBlock(ctx)}
});
`;
    return { path: "courier.config.ts", content, purpose };
  }
  const content = `import { defineConfig } from "@noverax/courier/config";

import { ${source.name} } from "${importSpecifier("courier.config.ts", api, ctx.extension)}";

/** The APIs this project calls. Courier's server route registers them from here, and Studio reads them. */
export default defineConfig({
  sources: { ${source.name === "api" ? "api" : `api: ${source.expression}`} },${studioBlock(ctx)}
});
`;
  return { path: "courier.config.ts", content, purpose };
}

/**
 * `courier.mocks.ts`: the example API's mock, which Studio starts with
 * itself on its port — 7001, or the next free one — the address the API
 * falls back to, with five users to begin with.
 *
 * @param ctx - The project, and what is set up in it
 * @param api - The example API's module, relative to the root
 * @param source - How the module gives the API
 * @returns The file
 * @example
 * ```ts
 * courierMocks(ctx, "src/courier/api.ts");
 * ```
 */
export function courierMocks(
  ctx: RecipeContext,
  api: string,
  source: ExampleSource = PLAIN,
): RecipeFile {
  const content = `import { defineMocks, defineMockServer } from "@noverax/courier-mock";

import { ${source.name} } from "${importSpecifier("courier.mocks.ts", api, ctx.extension)}";

/** The mock Courier Studio runs, so the app has data before it has a backend. */
export default defineMocks({
  api: defineMockServer({ source: ${source.expression}, port: ${ctx.ports.mock}, autoStart: true, seed: { users: 5 } }),
});
`;
  return {
    path: "courier.mocks.ts",
    content,
    purpose: `the mock Studio runs on port ${ctx.ports.mock}`,
  };
}
