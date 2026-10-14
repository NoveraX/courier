import { codeStyleOf, namedImport } from "../edit/code-style";
import { addImportLine } from "../edit/insert";
import { scanSource } from "../edit/source-scan";
import { firstExisting } from "./edits/studio-browser";
import { importSpecifier } from "./import-specifier";
import type { Recipe, RecipeContext, RecipeEdit, RecipeFile } from "./recipe-types";
import { devStep, routesStep, studioStep } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { proxyScripts } from "./shared/recipe-parts";
import { serverDir, serverFiles, studioAttachLater } from "./shared/server-files";

function routes(ctx: RecipeContext, dir: string, withPage: boolean): RecipeFile {
  const path = `${dir}/routes.ts`;
  const from = (file: string) => importSpecifier(path, `${dir}/${file}`, ctx.extension);
  const pageImports = withPage
    ? `import { emailOf, failure, usersPage } from "${from("page.ts")}";
import { caller } from "${from("server-caller.ts")}";
`
    : "";
  const page = withPage
    ? `
courier.get("/courier", async (_request, response) => {
  response.type("html").send(usersPage(await caller.users.list().catch(failure)));
});

/* Express 4 does not catch what an async handler throws, so the error goes to next() by hand. */
courier.post("/courier", express.urlencoded({ extended: false }), async (request, response, next) => {
  try {
    const name = typeof request.body?.name === "string" ? request.body.name : "";
    await caller.users.create({ name, email: emailOf(name) });
    response.redirect(303, "/courier");
  } catch (error) {
    next(error);
  }
});
`
    : "";
  const content = `import { registerSources } from "@noverax/courier";
import { courierHandler } from "@noverax/courier-express";
import ${withPage ? "express, { Router }" : "{ Router }"} from "express";

${pageImports}import config from "${from("config.ts")}";

registerSources(config.sources);
${ctx.choices.studio ? `\n${studioAttachLater()}\n` : ""}
/**
 * Courier's routes: /api/request, which browsers call your API through${withPage ? ",\n * and /courier, a page that shows it at work" : ""}. Mount them before any body
 * parser: the proxy reads the request's body itself.
 */
export const courier = Router();

courier.all("/api/request", courierHandler());
${page}`;
  return {
    path,
    content,
    purpose: withPage
      ? "Courier's routes: the proxy, and a page that shows it at work"
      : "Courier's proxy route",
  };
}

const APP = /^([ \t]*)(?:const|let) app = express\(\)[ \t]*(;?)[ \t]*$/m;

/* The app with Courier's routes mounted right after it is created, before any body parser. */
function mounted(text: string, specifier: string): string | undefined {
  if (text.includes(specifier)) return text;
  const found = text.match(new RegExp(APP.source, "gm"));
  const app = APP.exec(text);
  if (found?.length !== 1 || app === null) return undefined;
  const end = app.index + app[0].length;
  const withRoutes = `${text.slice(0, end)}\n${app[1] ?? ""}app.use(courier)${app[2] ?? ""}${text.slice(end)}`;
  const scan = scanSource(withRoutes);
  return scan === undefined
    ? undefined
    : addImportLine(scan, namedImport(codeStyleOf(text), ["courier"], specifier));
}

function mountEdit(ctx: RecipeContext, dir: string): RecipeEdit {
  const entries = [
    "src/index.ts",
    "src/server.ts",
    "src/app.ts",
    "index.ts",
    "server.ts",
    "app.ts",
  ];
  const path = firstExisting(ctx.project, entries);
  const specifier = importSpecifier(path, `${dir}/routes.ts`, ctx.extension);
  return {
    path,
    purpose: "mounts Courier's routes on the app, before its body parsers",
    change: (text) => mounted(text, specifier),
    manual: {
      file: "your server",
      what: "Mount Courier's routes on your Express app, before any body parser",
      lines: [`import { courier } from "${specifier}";`, "app.use(courier);"],
    },
  };
}

/**
 * Courier in an Express server: its API, registered as the server starts,
 * the proxy route browsers call it through and a page that shows it at
 * work, on a router mounted on the app — and Studio connected while you
 * develop.
 *
 * @param ctx - The project, and what is set up in it
 * @returns What setting Courier up takes
 * @example
 * ```ts
 * expressRecipe(ctx).files.map((file) => file.path);
 * ```
 */
export function expressRecipe(ctx: RecipeContext): Recipe {
  const example = ctx.choices.openapi === undefined;
  const dir = serverDir(ctx);
  return {
    files: [...serverFiles(ctx, dir), routes(ctx, dir, example)],
    edits: [mountEdit(ctx, dir)],
    ...courierPackages(ctx, { adapter: "@noverax/courier-express", proxy: true }),
    scripts: proxyScripts(ctx),
    manual: [],
    next: [...studioStep(ctx), ...routesStep(ctx), devStep(ctx, example ? "/courier" : undefined)],
  };
}
