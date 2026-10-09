import { majorOf } from "../project/read-project";
import { importSpecifier } from "./import-specifier";
import type { ManualStep, Recipe, RecipeContext, RecipeFile } from "./recipe-types";
import { devStep, studioStep } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { studioScripts } from "./shared/recipe-parts";
import { serverDir, serverFiles } from "./shared/server-files";

/* `fastify start -w` restarts the server on any change in the project, Studio's own data in .courier/ among them. */
function watchesAll(command: string): boolean {
  return /\bfastify start\b/.test(command) && /(?:^|\s)(?:-w|--watch)(?:\s|$)/.test(command);
}

/* The command with .courier/ among the paths its watcher leaves alone, in quotes a shell and cmd.exe both read. */
function ignoreCourier(command: string): string {
  if (!watchesAll(command) || command.includes(".courier")) return command;
  const flag = /--ignore-watch=("[^"]*"|'[^']*'|\S+)/.exec(command);
  if (flag === null)
    return command.replace(/\bfastify start\b/, "fastify start --ignore-watch=.courier");
  const value = (flag[1] ?? "").replace(/^["']|["']$/g, "");
  return command.replace(flag[0], `--ignore-watch="${value} .courier"`);
}

/* fastify-cli's apps load every plugin in src/plugins by themselves. */
function autoloads(ctx: RecipeContext): boolean {
  return ctx.project.lists("@fastify/autoload") && ctx.project.exists("src/plugins");
}

function plugin(ctx: RecipeContext, path: string, dir: string): RecipeFile {
  const from = (file: string) => importSpecifier(path, `${dir}/${file}`, ctx.extension);
  /* Fastify 5 takes the address first; 4 took the status first. */
  const redirect =
    (majorOf(ctx.project.version("fastify")) ?? 5) >= 5
      ? 'reply.redirect("/courier", 303)'
      : 'reply.redirect(303, "/courier")';
  const studio = ctx.choices.studio
    ? `
  if (process.env.NODE_ENV !== "production") {
    const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");
    await attachRuntime();
  }`
    : "";
  const content = `import { registerSources } from "@noverax/courier";
import { courierPlugin } from "@noverax/courier-fastify";
import fp from "fastify-plugin";

import { emailOf, failure, usersPage } from "${from("page.ts")}";
import { caller } from "${from("server-caller.ts")}";
import { sources } from "${from("sources.ts")}";

registerSources(sources);

/**
 * Courier's routes: /api/request, which browsers call your API through,
 * and /courier, a page that shows it at work${ctx.choices.studio ? ". While you develop, the\n * server's calls show in Courier Studio" : ""}.
 */
export default fp(async (fastify) => {${studio}
  await fastify.register(courierPlugin, { prefix: "/api/request" });
  /* The page's form posts URL-encoded, which only this plugin parses. */
  await fastify.register(async (page) => {
    page.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    });
    page.get("/courier", async (_request, reply) =>
      reply.type("text/html").send(usersPage(await caller.users.list().catch(failure))),
    );
    page.post<{ Body: { name?: string } }>("/courier", async (request, reply) => {
      const name = request.body.name ?? "";
      await caller.users.create({ name, email: emailOf(name) });
      return ${redirect};
    });
  });
});
`;
  return {
    path,
    content,
    purpose: "Courier's routes: the proxy, and a page that shows it at work",
  };
}

/**
 * Courier in a Fastify server: its API, registered as the server starts,
 * the proxy route browsers call it through, and a page that shows it at
 * work, in a plugin fastify-cli's apps load by themselves — others
 * register it — and Studio connected while you develop.
 *
 * @param ctx - The project, and what is set up in it
 * @returns What setting Courier up takes
 * @example
 * ```ts
 * fastifyRecipe(ctx).files.map((file) => file.path);
 * ```
 */
export function fastifyRecipe(ctx: RecipeContext): Recipe {
  const example = ctx.choices.openapi === undefined;
  const dir = serverDir(ctx);
  const path = autoloads(ctx) ? "src/plugins/courier.ts" : `${dir}/plugin.ts`;
  const register: ManualStep[] =
    example && !autoloads(ctx)
      ? [
          {
            file: "your server",
            what: "Register Courier's plugin on your Fastify app",
            lines: [
              `import courier from "./${path.replace(/\.ts$/, ctx.extension === ".js" ? ".js" : "")}";`,
              "await app.register(courier);",
            ],
          },
        ]
      : [];
  const packages = courierPackages(ctx, { adapter: "@noverax/courier-fastify" });
  return {
    files: [...serverFiles(ctx, dir), ...(example ? [plugin(ctx, path, dir)] : [])],
    edits: [],
    ...packages,
    dependencies: [...packages.dependencies, ...(example ? ["fastify-plugin"] : [])],
    scripts: studioScripts(ctx),
    rewrites: ctx.choices.studio
      ? Object.entries(ctx.project.manifest.scripts)
          .filter(([, command]) => watchesAll(command))
          .map(([script]) => ({
            script,
            why: `keeps ${script}'s watcher from restarting the server whenever Studio writes .courier/`,
            change: ignoreCourier,
          }))
      : [],
    manual: register,
    next: [...studioStep(ctx), devStep(ctx, example ? "/courier" : undefined)],
  };
}
