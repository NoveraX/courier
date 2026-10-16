import { codeStyleOf, namedImport } from "../edit/code-style";
import { loads } from "../edit/imports";
import { addImportLine } from "../edit/insert";
import { scanSource } from "../edit/source-scan";
import { importSpecifier } from "./import-specifier";
import type { Recipe, RecipeContext, RecipeEdit, RecipeFile } from "./recipe-types";
import { devStep, routesStep, studioStep } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { loadStep, proxyStart } from "./shared/proxy-start";
import { proxyScripts, sortParts } from "./shared/recipe-parts";
import {
  SERVER_DIR,
  serverFiles,
  serverHead,
  serverStart,
  studioAttachLater,
} from "./shared/server-files";
import { rootDirIncludeEdit } from "./shared/tsconfig-include";
import { addsExample, listModule, type ServerNeeds } from "./shared/wired";

function routes(ctx: RecipeContext, withPage: boolean, needs: ServerNeeds): RecipeFile {
  const path = `${SERVER_DIR}/routes.ts`;
  const list = importSpecifier(path, listModule(ctx, `${SERVER_DIR}/config.ts`), ctx.extension);
  const from = (file: string) => importSpecifier(path, `${SERVER_DIR}/${file}`, ctx.extension);
  const pageImports = withPage
    ? `import { emailOf, failure, usersPage } from "${from("page.ts")}";
import { caller } from "${from("server-caller.ts")}";
`
    : "";
  const page = withPage
    ? `
courier.get("/courier", async (c) => c.html(usersPage(await caller.users.list().catch(failure))));

courier.post("/courier", async (c) => {
  const { name } = await c.req.parseBody();
  const person = typeof name === "string" ? name : "";
  await caller.users.create({ name: person, email: emailOf(person) });
  return c.redirect("/courier", 303);
});
`
    : "";
  const content = `${serverHead(needs)}import { courierHandler } from "@noverax/courier-hono";
import { Hono } from "hono";
${serverStart(needs, pageImports, list)}
/**
 * Courier's routes: /api/request, which browsers call your API through${withPage ? ",\n * and /courier, a page that shows it at work" : ""}.
 */
export const courier = new Hono();

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

const ENTRY = "src/index.ts";
const APP = /^([ \t]*)const app = new Hono(?:<[^>]*>)?\(\)[ \t]*(;?)[ \t]*$/m;

/* The app with Courier's routes mounted right after it is created, as create-hono writes it. */
function mounted(text: string, specifier: string): string | undefined {
  if (loads(text, specifier)) return text;
  const found = text.match(new RegExp(APP.source, "gm"));
  const app = APP.exec(text);
  if (found?.length !== 1 || app === null) return undefined;
  const style = codeStyleOf(text);
  const end = app.index + app[0].length;
  const withRoute = `${text.slice(0, end)}\n${app[1] ?? ""}app.route(${style.quote}/${style.quote}, courier)${app[2] ?? ""}${text.slice(end)}`;
  const scan = scanSource(withRoute);
  return scan === undefined
    ? undefined
    : addImportLine(scan, namedImport(style, ["courier"], specifier));
}

function mountEdit(ctx: RecipeContext): RecipeEdit {
  const specifier = importSpecifier(ENTRY, `${SERVER_DIR}/routes.ts`, ctx.extension);
  return {
    path: ENTRY,
    purpose: "mounts Courier's routes on the app",
    change: (text) => mounted(text, specifier),
    manual: {
      file: ENTRY,
      what: "Mount Courier's routes on your Hono app",
      lines: [`import { courier } from "${specifier}";`, 'app.route("/", courier);'],
    },
  };
}

/**
 * Courier in a Hono server: its API, registered as the server starts, the
 * proxy route browsers call it through, a page that shows it at work, all
 * mounted on the app — and Studio connected while you develop.
 *
 * @param ctx - The project, and what is set up in it
 * @returns What setting Courier up takes
 * @example
 * ```ts
 * honoRecipe(ctx).files.map((file) => file.path);
 * ```
 */
export function honoRecipe(ctx: RecipeContext): Recipe {
  const example = addsExample(ctx);
  const { parts, mount } = proxyStart(
    ctx,
    (needs) => routes(ctx, example, needs),
    {
      module: "@noverax/courier-hono",
      exported: "courierHandler",
      connect: (path) => loadStep(path, "mount its routes on your Hono app"),
    },
    studioAttachLater(),
  );
  const { files, manual } = sortParts(parts);
  return {
    files: [...serverFiles(ctx, SERVER_DIR), ...files],
    /* A project set up already compiles its config as it is. */
    edits: [
      ...(mount ? [mountEdit(ctx)] : []),
      ...(ctx.configured === undefined ? rootDirIncludeEdit(ctx) : []),
    ],
    ...courierPackages(ctx, { adapter: "@noverax/courier-hono", proxy: true }),
    scripts: proxyScripts(ctx),
    manual,
    next: [...studioStep(ctx), ...routesStep(ctx), devStep(ctx, example ? "/courier" : undefined)],
  };
}
