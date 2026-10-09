import { importSpecifier } from "../import-specifier";
import type { RecipeContext, RecipeFile } from "../recipe-types";

/* An endpoint's chain: on one line, or with `.agent()` on a line of its own where the reads are offered to agents. */
function chain(ctx: RecipeContext, head: string, description: string, rest: string): string {
  if (!ctx.choices.mcp) return `endpoint${head}${rest}`;
  const agent = `.agent({ description: ${JSON.stringify(description)}, access: "read" })`;
  return `endpoint\n      ${head}\n      ${agent}\n      ${rest}`;
}

/** How the example API is reached. */
export interface ExampleReach {
  /** The expression the API's address is read from. */
  readonly baseUrl: string;
  /** The environment variable in it that names a backend. */
  readonly variable: string;
  /** Code the address needs above the API: how the environment is read. */
  readonly prelude?: string;
  /**
   * Whether the module exports `createApi(baseURL)` in place of `api`: an
   * app that reaches the API at an address its platform decides, and Studio,
   * which loads the module outside the app, each build their own.
   */
  readonly factory?: boolean;
  /** Whether the browser calls it through the app's route, which a boundary guards. */
  readonly proxied: boolean;
}

/**
 * The example API: users the app lists, reads one by one and creates,
 * each call checked by its Zod schema. Its address comes from the
 * environment the framework gives code, and falls back to the mock Studio
 * runs. Where the browser calls it through the app's route, its boundary
 * holds the browser's reach to what it names.
 *
 * @param ctx - The project, and what is set up in it
 * @param dir - The folder Courier's own modules go in
 * @param reach - How it is reached
 * @returns `api.ts`, and `boundary.ts` where it is proxied
 * @example
 * ```ts
 * exampleApi(ctx, "src/courier", { baseUrl: 'process.env.API_URL ?? "http://localhost:7001"', variable: "API_URL", proxied: true });
 * ```
 */
export function exampleApi(ctx: RecipeContext, dir: string, reach: ExampleReach): RecipeFile[] {
  const api = `${dir}/api.ts`;
  const boundary = importSpecifier(api, `${dir}/boundary.ts`, ctx.extension);
  const content = `import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { z } from "zod";
${
  reach.proxied
    ? `
import { boundary } from "${boundary}";
`
    : ""
}
const { endpoint } = courier();

/** A user, as the API answers one. */
export const User = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

/** What creating a user sends. */
export const NewUser = z.object({
  name: z.string().min(1),
  email: z.string(),
});

const users = defineGroup({
  prefix: "users",
  endpoints: {
    list: ${chain(ctx, '.get("")', "List every user, with their id, name and email.", ".response(z.array(User))")},
    get: ${chain(ctx, '.get(":id")', "Get one user by their id.", ".variables(z.object({ id: z.string() })).response(User)")},
    create: endpoint.post("").variables(NewUser).response(User),
  },
});

${reach.prelude ?? ""}${reach.factory ? factoryTail(ctx) : apiTail(ctx, reach)}`;
  const files = [{ path: api, content, purpose: "your API, typed, with an example to start from" }];
  if (!reach.proxied) return files;
  return [
    ...files,
    {
      path: `${dir}/boundary.ts`,
      content: BOUNDARY,
      purpose: "the endpoints the browser may call",
    },
  ];
}

function apiTail(ctx: RecipeContext, reach: ExampleReach): string {
  return `/**
 * Your API, as Courier calls it. Until ${reach.variable} names your backend
 * it answers from the mock that Courier Studio runs on port ${ctx.ports.mock}.
 */
export const api = defineApi({
  baseURL: ${reach.baseUrl},${reach.proxied ? "\n  boundary," : ""}
  groups: { users },
});
`;
}

function factoryTail(ctx: RecipeContext): string {
  return `/**
 * Your API, as Courier calls it, at an address: the app's, which a
 * simulator and a phone reach differently, or — for Studio — the mock it
 * runs on port ${ctx.ports.mock}.
 */
export function createApi(baseURL: string) {
  return defineApi({ baseURL, groups: { users } });
}
`;
}

const BOUNDARY = `import { defineBoundary } from "@noverax/courier/define";

/**
 * The endpoints a browser may call through the app's /api/request route.
 * The server refuses every other, and the browser's bundle holds this list
 * in place of your API's definition.
 */
export const boundary = defineBoundary({
  source: "api",
  expose: {
    "users.list": "query",
    "users.get": "query",
    "users.create": "mutation",
  },
});
`;
