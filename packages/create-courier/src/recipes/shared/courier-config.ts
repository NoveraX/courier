import { READS_POLICY } from "../../agents-policy-edit";
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

/** The example API as its module exports it. */
export const PLAIN_SOURCE: ExampleSource = { name: "api", expression: "api" };

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

/* What agents may call, where they were asked for: every read, and a write once it is marked `.agent()`. */
function agentsBlock(ctx: RecipeContext): string {
  return ctx.choices.mcp
    ? `\n  // What agents in your editor may call: every read, and a write marked .agent()\n  ${READS_POLICY},`
    : "";
}

/* Where the list is kept: the project's root, or — for a server TypeScript compiles from `src/` alone — beside the server's code. */
function listComment(path: string): string {
  return path === "courier.config.ts"
    ? `/**
 * The APIs this project calls. Studio and the MCP server read them here,
 * and an API Studio imports is declared here too.
 */`
    : `/**
 * The APIs this project calls: the server registers them from here as it
 * starts, and courier.config.ts passes the list on to Studio and the MCP
 * server — an API Studio imports is declared here too.
 */`;
}

/**
 * The project's one list of the APIs it calls — `courier.config.ts`, or
 * a module the server compiles, which `courier.config.ts` passes on: the
 * app registers them from it, and Studio and the MCP server read them
 * there. With a specification to import it starts empty, and the import
 * declares the API in it.
 *
 * @param ctx - The project, and what is set up in it
 * @param api - The example API's module, relative to the root
 * @param source - How the module gives the API
 * @param path - Where the list goes, relative to the root
 * @returns The file
 * @example
 * ```ts
 * courierConfig(ctx, "src/courier/api.ts");
 * courierConfig(ctx, "src/courier/api.ts", PLAIN_SOURCE, "src/courier/config.ts");
 * ```
 */
export function courierConfig(
  ctx: RecipeContext,
  api: string,
  source: ExampleSource = PLAIN_SOURCE,
  path = "courier.config.ts",
): RecipeFile {
  const purpose =
    path === "courier.config.ts"
      ? "lists your APIs for the app, Studio and agents"
      : "lists your APIs: the server registers them from here";
  const sources =
    ctx.choices.openapi !== undefined
      ? "{}"
      : `{ ${source.name === "api" ? "api" : `api: ${source.expression}`} }`;
  const example =
    ctx.choices.openapi !== undefined
      ? ""
      : `\nimport { ${source.name} } from "${importSpecifier(path, api, ctx.extension)}";\n`;
  const content = `import { defineConfig } from "@noverax/courier/config";
${example}
${listComment(path)}
export default defineConfig({
  sources: ${sources},${studioBlock(ctx)}${agentsBlock(ctx)}
});
`;
  return { path, content, purpose };
}

/**
 * `courier.config.ts` for a server TypeScript compiles from `src/` alone,
 * which cannot import a file at the project's root: the list lives in a
 * module beside the server's code, and the config at the root passes it on
 * to Studio and the MCP server — one list, which Studio edits where it is
 * written.
 *
 * @param ctx - The project, and what is set up in it
 * @param list - The module that holds the list, relative to the root
 * @returns The file
 * @example
 * ```ts
 * passOnConfig(ctx, "src/courier/config.ts").content; // 'export { default } from "./src/courier/config";' …
 * ```
 */
export function passOnConfig(ctx: RecipeContext, list: string): RecipeFile {
  const content = `/**
 * The APIs this project calls, as ${list} lists them:
 * the server compiles src/ alone, so the list lives there,
 * and Studio and the MCP server read it through this file.
 */
export { default } from "${importSpecifier("courier.config.ts", list, ctx.extension)}";
`;
  return {
    path: "courier.config.ts",
    content,
    purpose: `passes ${list}'s list on to Studio and agents`,
  };
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
  source: ExampleSource = PLAIN_SOURCE,
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
