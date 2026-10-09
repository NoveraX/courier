import { codeStyleOf, namedImport } from "../edit/code-style";
import { addImportLine, appendItem } from "../edit/insert";
import { decoratorLiteral, propertyLiteral } from "../edit/literal";
import { scanSource } from "../edit/source-scan";
import { importSpecifier } from "./import-specifier";
import type { NextStep, Recipe, RecipeContext, RecipeEdit, RecipeFile } from "./recipe-types";
import { studioStep } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { studioScripts } from "./shared/recipe-parts";
import { SERVER_DIR, serverFiles } from "./shared/server-files";

const APP_MODULE = "src/app.module.ts";

function courierModule(ctx: RecipeContext): RecipeFile[] {
  const path = `${SERVER_DIR}/courier.module.ts`;
  const controller = `${SERVER_DIR}/courier.controller.ts`;
  const from = (at: string, file: string) =>
    importSpecifier(at, `${SERVER_DIR}/${file}`, ctx.extension);
  const studio = ctx.choices.studio
    ? `

  /** Connects the server to Courier Studio while you develop: the calls it makes show there. */
  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === "production") return;
    const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");
    await attachRuntime();
  }`
    : "";
  const module = `import { type MiddlewareConsumer, Module, type NestModule${ctx.choices.studio ? ", type OnModuleInit" : ""} } from "@nestjs/common";
import { registerSources } from "@noverax/courier";
import { courierMiddleware } from "@noverax/courier-nestjs";

import { CourierController } from "${from(path, "courier.controller.ts")}";
import { sources } from "${from(path, "sources.ts")}";

registerSources(sources);

/**
 * Courier's routes: /api/request, which browsers call your API through,
 * and /courier, a page that shows it at work.
 */
@Module({ controllers: [CourierController] })
export class CourierModule implements NestModule${ctx.choices.studio ? ", OnModuleInit" : ""} {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(courierMiddleware()).forRoutes("api/request");
  }${studio}
}
`;
  const page = `import { Body, Controller, Get, Header, Post, Redirect } from "@nestjs/common";

import { emailOf, failure, usersPage } from "${from(controller, "page.ts")}";
import { caller } from "${from(controller, "server-caller.ts")}";

/** A page that shows Courier at work: your API's users, and a form that creates one. */
@Controller("courier")
export class CourierController {
  @Get()
  @Header("content-type", "text/html; charset=utf-8")
  async page(): Promise<string> {
    return usersPage(await caller.users.list().catch(failure));
  }

  @Post()
  @Redirect("/courier", 303)
  async add(@Body() body: { name?: string }): Promise<void> {
    const name = body.name ?? "";
    await caller.users.create({ name, email: emailOf(name) });
  }
}
`;
  return [
    { path, content: module, purpose: "Courier's module: the proxy route, and the page" },
    { path: controller, content: page, purpose: "the page that shows Courier at work" },
  ];
}

/* The root module with Courier's in its imports, as `nest new` writes it. */
function imported(text: string, specifier: string): string | undefined {
  if (text.includes("CourierModule")) return text;
  const scan = scanSource(text);
  const options = scan === undefined ? undefined : decoratorLiteral(scan, "Module");
  if (scan === undefined || options === undefined) return undefined;
  const imports = propertyLiteral(scan, options, "imports");
  const changed =
    imports === null
      ? appendItem(scan, options, "imports: [CourierModule]")
      : imports !== undefined && text[imports.open] === "["
        ? appendItem(scan, imports, "CourierModule")
        : undefined;
  const rescanned = changed === undefined ? undefined : scanSource(changed);
  return rescanned === undefined
    ? undefined
    : addImportLine(rescanned, namedImport(codeStyleOf(text), ["CourierModule"], specifier));
}

function importEdit(ctx: RecipeContext): RecipeEdit {
  const specifier = importSpecifier(APP_MODULE, `${SERVER_DIR}/courier.module.ts`, ctx.extension);
  return {
    path: APP_MODULE,
    purpose: "imports Courier's module into the app's",
    change: (text) => imported(text, specifier),
    manual: {
      file: APP_MODULE,
      what: "Import Courier's module into your root module",
      lines: [`import { CourierModule } from "${specifier}";`, "imports: [CourierModule],"],
    },
  };
}

/* How the person starts the app, and where its page is: `nest new` prints no address, so the port is read from main.ts. */
function startStep(ctx: RecipeContext, example: boolean): NextStep {
  const script = ctx.project.manifest.scripts["start:dev"] === undefined ? "start" : "start:dev";
  const port =
    /\.listen\([^)]*?(\d{2,5})/.exec(ctx.project.read("src/main.ts") ?? "")?.[1] ?? "3000";
  return {
    command: ctx.manager.run(script),
    what: example ? `starts the app: open http://localhost:${port}/courier` : "starts the app",
  };
}

/**
 * Courier in a NestJS app: its API, registered as the server starts, the
 * proxy route browsers call it through and a page that shows it at work,
 * in a module of Courier's imported into the app's — and Studio connected
 * while you develop.
 *
 * @param ctx - The project, and what is set up in it
 * @returns What setting Courier up takes
 * @example
 * ```ts
 * nestRecipe(ctx).files.map((file) => file.path);
 * ```
 */
export function nestRecipe(ctx: RecipeContext): Recipe {
  const example = ctx.choices.openapi === undefined;
  return {
    files: [...serverFiles(ctx, SERVER_DIR), ...(example ? courierModule(ctx) : [])],
    edits: example ? [importEdit(ctx)] : [],
    ...courierPackages(ctx, { adapter: "@noverax/courier-nestjs" }),
    scripts: studioScripts(ctx),
    manual: [],
    next: [...studioStep(ctx), startStep(ctx, example)],
  };
}
