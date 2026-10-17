/**
 * A project whose config declares its APIs already, and whose files wire
 * Courier up by hand, in each framework: the setup offers nothing it has.
 * Each case has a twin whose file is there but does not do its part — the
 * call commented out, other sources registered — where the step stays.
 */
import { afterAll, describe, expect, it } from "vitest";

import { frameworkById } from "../../src/frameworks";
import { buildPlan, changesAnything, type Plan } from "../../src/plan/build-plan";
import { contextOf, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const { version } = await import("../../package.json");
const RANGE = version === "0.0.0" ? "*" : `^${version}`;

/* Every package any setup installs, so a plan is left with files and steps alone. */
const COURIER = [
  "@noverax/courier",
  "@noverax/courier-next",
  "@noverax/courier-nuxt",
  "@noverax/courier-sveltekit",
  "@noverax/courier-astro",
  "@noverax/courier-remix",
  "@noverax/courier-solid",
  "@noverax/courier-nestjs",
  "@noverax/courier-fastify",
  "@noverax/courier-hono",
  "@noverax/courier-express",
  "@noverax/courier-studio-core",
  "@noverax/courier-studio",
  "@noverax/courier-cli",
];

function manifestWith(framework: Record<string, string>): string {
  const courier = Object.fromEntries(COURIER.map((name) => [name, RANGE]));
  return JSON.stringify(
    {
      name: "app",
      private: true,
      scripts: { dev: "dev", studio: "courier-studio", routes: "courier-cli routes" },
      dependencies: { ...framework, ...courier, zod: "^4.1.0", "fastify-plugin": "^5.0.0" },
      devDependencies: { typescript: "^6.0.3" },
    },
    null,
    2,
  );
}

const CONFIG = `import { defineConfig } from "@noverax/courier/config";
import { shop } from "./api/shop";

export default defineConfig({ sources: { shop } });
`;

const RUNTIME = '"@noverax/courier-studio-core/runtime"';
const ATTACH = `const { attachRuntime } = await import(${RUNTIME});\n  await attachRuntime();`;
const ATTACH_COMMENTED = `// const { attachRuntime } = await import(${RUNTIME});\n  // await attachRuntime();`;
const ATTACH_LATER = `import(${RUNTIME}).then(({ attachRuntime }) => attachRuntime());`;

function planOf(id: string, marker: string, files: Record<string, string>): Plan {
  const framework = frameworkById(id);
  const ctx = contextOf(projectWith(files), marker);
  if (framework.recipe === undefined) throw new Error(`${id} has no recipe`);
  return buildPlan(ctx, framework.recipe(ctx));
}

/* What a plan still offers: the files it creates, the files it changes, and the steps left to the person. */
function offered(plan: Plan): string[] {
  return [
    ...plan.files
      .filter((file) => file.state !== "same" && file.state !== "courier")
      .map((file) => `${file.state} ${file.path}`),
    ...plan.edits.filter((edit) => edit.state === "edit").map((edit) => `edit ${edit.path}`),
    ...plan.manual.map((step) => `step ${step.file}`),
    ...[...plan.dependencies, ...plan.devDependencies].map((name) => `package ${name}`),
  ];
}

function stepLines(plan: Plan, file: string): string {
  return plan.manual.find((step) => step.file === file)?.lines.join("\n") ?? "";
}

function expectNothingOffered(plan: Plan): void {
  expect(offered(plan)).toEqual([]);
  expect(changesAnything(plan)).toBe(false);
}

const NEXT_SERVER = `import { registerSources } from "@noverax/courier";

export async function register() {
  const { default: config } = await import("./courier.config");
  registerSources(config.sources);
  if (process.env.NODE_ENV === "development") {
  ${ATTACH}
  }
}
`;
const NEXT_ROUTE =
  'import { apiRoute } from "@noverax/courier-next";\n\nexport const { GET, POST } = apiRoute();\n';
const NEXT_BROWSER = `import { attachRuntime } from ${RUNTIME};\n\nif (process.env.NODE_ENV === "development") attachRuntime("next-browser");\n`;
const PHASE_CONFIG = `const nextConfig = {};

export default async function config(phase) {
  if (phase !== "phase-development-server") return nextConfig;
  const { withCourierStudio } = await import("@noverax/courier-studio/next");
  return withCourierStudio()(nextConfig);
}
`;

function nextApp(next: string, extra: Record<string, string>) {
  return {
    "package.json": manifestWith({ next, react: "19.2.0" }),
    "tsconfig.json": "{}",
    "courier.config.ts": CONFIG,
    "app/page.tsx": "export default function Home() { return null; }\n",
    "instrumentation.ts": NEXT_SERVER,
    ...extra,
  };
}

describe("a Next.js app set up already", () => {
  it("is offered nothing on Next.js 16, its proxy route served from a path of its own", () => {
    const plan = planOf(
      "next",
      "next",
      nextApp("16.4.0", {
        "next.config.ts": "export default {};\n",
        "instrumentation-client.ts": NEXT_BROWSER,
        "app/api/courier/route.ts": NEXT_ROUTE,
      }),
    );

    expectNothingOffered(plan);
    expect(plan.files.map((file) => file.path)).not.toContain("app/api/request/route.ts");
  });

  it("is offered the Studio connections it has only in comments, without registering again", () => {
    const plan = planOf(
      "next",
      "next",
      nextApp("16.4.0", {
        "next.config.ts": "export default {};\n",
        "instrumentation.ts": NEXT_SERVER.replace(ATTACH, ATTACH_COMMENTED),
        "instrumentation-client.ts": `// ${NEXT_BROWSER.split("\n")[0]}\n`,
        "app/api/request/route.ts": NEXT_ROUTE,
      }),
    );

    expect(offered(plan)).toEqual(["step instrumentation.ts", "step instrumentation-client.ts"]);
    expect(stepLines(plan, "instrumentation.ts")).toContain("await attachRuntime();");
    expect(stepLines(plan, "instrumentation.ts")).not.toContain("registerSources");
    expect(stepLines(plan, "instrumentation-client.ts")).toContain(
      'attachRuntime("next-browser");',
    );
  });

  it("is offered nothing on Next.js 15 whose config loads Studio under next dev alone", () => {
    expectNothingOffered(
      planOf(
        "next",
        "next",
        nextApp("15.5.9", {
          "next.config.mjs": PHASE_CONFIG,
          "app/api/request/route.ts": NEXT_ROUTE,
        }),
      ),
    );
  });

  it("is told only to load Studio under next dev where its config loads it on every command", () => {
    const plan = planOf(
      "next",
      "next",
      nextApp("15.5.9", {
        "next.config.js":
          'const { withCourierStudio } = require("@noverax/courier-studio/next");\nmodule.exports = withCourierStudio()({});\n',
        "app/api/request/route.ts": NEXT_ROUTE,
      }),
    );

    expect(offered(plan)).toEqual(["step next.config.js"]);
    expect(plan.manual[0]?.lines).toEqual([
      'if (phase !== "phase-development-server") return nextConfig;',
      'const { withCourierStudio } = await import("@noverax/courier-studio/next");',
    ]);
  });

  it("is given the whole wrapper where its config names Studio in a comment alone, and the route where its route serves something else", () => {
    const plan = planOf(
      "next",
      "next",
      nextApp("15.5.9", {
        "next.config.mjs": "// withCourierStudio()(nextConfig)\nexport default {};\n",
        "app/api/request/route.ts": 'export function GET() { return new Response("ok"); }\n',
      }),
    );

    expect(offered(plan)).toEqual([
      "kept app/api/request/route.ts",
      "step app/api/request/route.ts",
      "step next.config.mjs",
    ]);
    expect(stepLines(plan, "next.config.mjs")).toContain(
      "export default async function config(phase) {",
    );
  });
});

const NITRO_PLUGIN = `import { registerSources } from "@noverax/courier";
import config from "../../courier.config";

export default defineNitroPlugin(async () => {
  registerSources(config.sources);
  if (import.meta.dev) {
  ${ATTACH}
  }
});
`;

function nuxtApp(extra: Record<string, string>) {
  return {
    "package.json": manifestWith({ nuxt: "^4.6.0" }),
    "tsconfig.json": "{}",
    "courier.config.ts": CONFIG,
    "app/app.vue": "<template><NuxtPage /></template>\n",
    "nuxt.config.ts":
      'import { courierStudioModule } from "@noverax/courier-studio/nuxt";\n\nexport default defineNuxtConfig({ modules: [courierStudioModule] });\n',
    "server/plugins/api.ts": NITRO_PLUGIN,
    "server/api/courier.ts":
      'import { courierHandler } from "@noverax/courier-nuxt";\n\nexport default courierHandler();\n',
    ...extra,
  };
}

describe("a Nuxt app set up already", () => {
  it("is offered nothing, its plugin and route under names of its own", () => {
    expectNothingOffered(planOf("nuxt", "nuxt", nuxtApp({})));
  });

  it("is offered the registration where its plugin registers other sources, and Studio's module where it is commented out", () => {
    const plan = planOf(
      "nuxt",
      "nuxt",
      nuxtApp({
        "server/plugins/api.ts":
          'import { registerSources } from "@noverax/courier";\nimport { legacy } from "../legacy";\n\nexport default defineNitroPlugin(() => registerSources({ legacy }));\n',
        "nuxt.config.ts":
          "export default defineNuxtConfig({\n  // modules: [courierStudioModule],\n  modules: [],\n});\n",
      }),
    );

    expect(offered(plan)).toEqual(["create server/plugins/courier.ts", "edit nuxt.config.ts"]);
    const plugin = plan.files.find((file) => file.path === "server/plugins/courier.ts")?.content;
    expect(plugin).toContain("registerSources(config.sources);");
    expect(plugin).toContain("await attachRuntime();");
  });
});

const SVELTE_HOOKS = `import { registerSources } from "@noverax/courier";
import config from "../courier.config";

registerSources(config.sources);

if (import.meta.env.DEV) {
  ${ATTACH}
}
`;

function svelteApp(extra: Record<string, string>) {
  return {
    "package.json": manifestWith({ "@sveltejs/kit": "^2.40.0" }),
    "tsconfig.json": "{}",
    "courier.config.ts": CONFIG,
    "vite.config.ts":
      'import { sveltekit } from "@sveltejs/kit/vite";\nimport { courierStudio } from "@noverax/courier-studio/sveltekit";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({ plugins: [sveltekit(), courierStudio()] });\n',
    "src/hooks.server.ts": SVELTE_HOOKS,
    "src/routes/api/request/+server.ts":
      'import { courierHandler } from "@noverax/courier-sveltekit";\n\nexport const GET = courierHandler();\nexport const POST = GET;\n',
    ...extra,
  };
}

describe("a SvelteKit app set up already", () => {
  it("is offered nothing", () => {
    expectNothingOffered(planOf("sveltekit", "@sveltejs/kit", svelteApp({})));
  });

  it("is offered only the server's Studio connection its hooks have commented out", () => {
    const plan = planOf(
      "sveltekit",
      "@sveltejs/kit",
      svelteApp({
        "src/hooks.server.ts": SVELTE_HOOKS.replace(ATTACH, ATTACH_COMMENTED),
      }),
    );

    expect(offered(plan)).toEqual(["step src/hooks.server.ts"]);
    expect(stepLines(plan, "src/hooks.server.ts")).toContain("await attachRuntime();");
    expect(stepLines(plan, "src/hooks.server.ts")).not.toContain("registerSources");
  });
});

const ASTRO_ROUTE =
  'import { courierHandler } from "@noverax/courier-astro";\n\nexport const prerender = false;\nexport const GET = courierHandler();\nexport const POST = GET;\n';

function astroSite(extra: Record<string, string>) {
  return {
    "package.json": manifestWith({ astro: "^5.14.0" }),
    "tsconfig.json": "{}",
    "courier.config.ts": CONFIG,
    "astro.config.mjs":
      'import node from "@astrojs/node";\nimport { courierStudio } from "@noverax/courier-studio/astro";\nimport { defineConfig } from "astro/config";\n\nexport default defineConfig({ adapter: node({ mode: "standalone" }), integrations: [courierStudio()] });\n',
    "src/middleware.ts": `import { registerSources } from "@noverax/courier";\nimport { defineMiddleware } from "astro/middleware";\nimport config from "../courier.config";\n\nregisterSources(config.sources);\nif (import.meta.env.DEV) {\n  ${ATTACH}\n}\n\nexport const onRequest = defineMiddleware((_context, next) => next());\n`,
    "src/pages/api/request.ts": ASTRO_ROUTE,
    ...extra,
  };
}

describe("an Astro site set up already", () => {
  it("is offered nothing", () => {
    expectNothingOffered(planOf("astro", "astro", astroSite({})));
  });

  it("keeps a route whose handler is only in a comment as the person's, and names the adapter written in a comment alone", () => {
    const plan = planOf(
      "astro",
      "astro",
      astroSite({
        "src/pages/api/request.ts":
          '// export const GET = courierHandler();\nexport const GET = () => new Response("ok");\n',
        "astro.config.mjs":
          'import { courierStudio } from "@noverax/courier-studio/astro";\n\nexport default defineConfig({\n  // adapter: node(),\n  integrations: [courierStudio()],\n});\n',
      }),
    );

    expect(offered(plan)).toEqual([
      "kept src/pages/api/request.ts",
      "step src/pages/api/request.ts",
      "step astro.config",
    ]);
  });
});

const RR_ROUTE = `import { registerSources } from "@noverax/courier";
import { courierHandler } from "@noverax/courier-remix";
import config from "../../courier.config";

registerSources(config.sources);

if (import.meta.env.DEV) {
  ${ATTACH}
}

const handler = courierHandler();
export const loader = handler;
export const action = handler;
`;

function reactRouterApp(marker: string, extra: Record<string, string>) {
  return {
    "package.json": manifestWith({ [marker]: "^7.9.0", react: "19.2.0" }),
    "tsconfig.json": "{}",
    "courier.config.ts": CONFIG,
    "vite.config.ts":
      'import { courierStudio } from "@noverax/courier-studio/remix";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({ plugins: [courierStudio()] });\n',
    "app/routes/api.request.ts": RR_ROUTE,
    ...extra,
  };
}

const ROUTES_LIST =
  'import { index, route } from "@react-router/dev/routes";\n\nexport default [index("routes/home.tsx"), route("api/request", "routes/api.request.ts")];\n';

describe("a React Router or Remix app set up already", () => {
  it("is offered nothing, its route listed already", () => {
    expectNothingOffered(
      planOf(
        "react-router",
        "@react-router/dev",
        reactRouterApp("@react-router/dev", { "app/routes.ts": ROUTES_LIST }),
      ),
    );
    expectNothingOffered(planOf("remix", "@remix-run/dev", reactRouterApp("@remix-run/dev", {})));
  });

  it("is offered the registration its route lacks, in that route, and no second route", () => {
    const plan = planOf(
      "react-router",
      "@react-router/dev",
      reactRouterApp("@react-router/dev", {
        "app/routes.ts": ROUTES_LIST,
        "app/routes/api.request.ts": RR_ROUTE.replace(
          "registerSources(config.sources);",
          "registerSources({});",
        ),
      }),
    );

    expect(offered(plan)).toEqual(["step app/routes/api.request.ts"]);
    expect(stepLines(plan, "app/routes/api.request.ts")).toContain(
      "registerSources(config.sources);",
    );
    expect(stepLines(plan, "app/routes/api.request.ts")).not.toContain("attachRuntime");
  });

  it("lists the route where the routes file names it only in a comment", () => {
    const plan = planOf(
      "react-router",
      "@react-router/dev",
      reactRouterApp("@react-router/dev", {
        "app/routes.ts":
          'import { index, route } from "@react-router/dev/routes";\n\n// route("api/request", "routes/api.request.ts"),\nexport default [index("routes/home.tsx")];\n',
        "app/routes/api.request.ts": "export const loader = () => null;\n",
      }),
    );

    expect(offered(plan)).toEqual([
      "kept app/routes/api.request.ts",
      "edit app/routes.ts",
      "step app/routes/api.request.ts",
    ]);
  });

  it("in Remix, is offered the server's Studio connection its route lacks", () => {
    const plan = planOf(
      "remix",
      "@remix-run/dev",
      reactRouterApp("@remix-run/dev", {
        "app/routes/api.request.ts": RR_ROUTE.replace(ATTACH, ATTACH_COMMENTED),
      }),
    );

    expect(offered(plan)).toEqual(["step app/routes/api.request.ts"]);
    expect(stepLines(plan, "app/routes/api.request.ts")).toContain("attachRuntime");
    expect(stepLines(plan, "app/routes/api.request.ts")).not.toContain("registerSources");
  });
});

function solidApp(extra: Record<string, string>) {
  return {
    "package.json": manifestWith({ "@solidjs/start": "^1.2.0" }),
    "tsconfig.json": "{}",
    "courier.config.ts": CONFIG,
    "app.config.ts":
      'import { defineConfig } from "@solidjs/start/config";\nimport { courierStudio } from "@noverax/courier-studio/solid";\n\nexport default defineConfig({ vite: { plugins: [courierStudio()] } });\n',
    "src/routes/api/request.ts": RR_ROUTE.replace(
      "@noverax/courier-remix",
      "@noverax/courier-solid",
    ).replace("../../courier.config", "../../../courier.config"),
    ...extra,
  };
}

describe("a SolidStart app set up already", () => {
  it("is offered nothing", () => {
    expectNothingOffered(planOf("solid-start", "@solidjs/start", solidApp({})));
  });

  it("is told to add Studio's plugin where app.config.ts has it commented out", () => {
    const plan = planOf(
      "solid-start",
      "@solidjs/start",
      solidApp({
        "app.config.ts":
          'import { defineConfig } from "@solidjs/start/config";\n\nexport default defineConfig({ vite: { plugins: [/* courierStudio() */] } });\n',
      }),
    );

    expect(offered(plan)).toEqual(["step app.config.ts"]);
  });
});

describe("an Expo app set up already", () => {
  const app = (config: string) => ({
    "package.json": manifestWith({ expo: "~54.0.0", react: "19.1.0", "react-native": "0.81.0" }),
    "tsconfig.json": "{}",
    "courier.config.ts": config,
  });

  it("is offered no example", () => {
    const plan = planOf("expo", "expo", app(CONFIG));

    expectNothingOffered(plan);
    expect(plan.files.map((file) => file.path)).toEqual(["courier.config.ts"]);
  });

  it("is offered the example where its config declares no API yet", () => {
    const plan = planOf("expo", "expo", app("export default defineConfig({ sources: {} });\n"));

    expect(offered(plan)).toContain("create courier/api.ts");
    expect(offered(plan).some((each) => each.startsWith("package @noverax/courier-react"))).toBe(
      true,
    );
  });
});

const NEST_MODULE = `import { type MiddlewareConsumer, Module, type NestModule, type OnModuleInit } from "@nestjs/common";
import { registerSources } from "@noverax/courier";
import { courierMiddleware } from "@noverax/courier-nestjs";

import config from "./courier/config";

registerSources(config.sources);

@Module({})
export class ApiModule implements NestModule, OnModuleInit {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(courierMiddleware()).forRoutes("api/request");
  }

  async onModuleInit(): Promise<void> {
  ${ATTACH}
  }
}
`;

function serverApp(framework: Record<string, string>, extra: Record<string, string>) {
  return {
    "package.json": manifestWith(framework),
    "tsconfig.json": "{}",
    "courier.config.ts": 'export { default } from "./src/courier/config";\n',
    "src/courier/config.ts": CONFIG,
    ...extra,
  };
}

describe("a NestJS app set up already", () => {
  const app = (module: string) =>
    serverApp(
      { "@nestjs/core": "^11.1.0", "@nestjs/common": "^11.1.0" },
      {
        "src/api.module.ts": module,
        "src/app.module.ts":
          'import { Module } from "@nestjs/common";\nimport { ApiModule } from "./api.module";\n\n@Module({ imports: [ApiModule] })\nexport class AppModule {}\n',
      },
    );

  it("is offered nothing, its middleware in a module of its own", () => {
    expectNothingOffered(planOf("nestjs", "@nestjs/core", app(NEST_MODULE)));
  });

  it("is offered Courier's module where its own names the middleware in a string alone, without registering again", () => {
    const plan = planOf(
      "nestjs",
      "@nestjs/core",
      app(
        NEST_MODULE.replace(
          "consumer.apply(courierMiddleware())",
          'consumer.apply("courierMiddleware()" as never)',
        ),
      ),
    );

    expect(offered(plan)).toEqual([
      "create src/courier/courier.module.ts",
      "edit src/app.module.ts",
    ]);
    const module = plan.files.find(
      (file) => file.path === "src/courier/courier.module.ts",
    )?.content;
    expect(module).toContain("courierMiddleware()");
    expect(module).not.toContain("registerSources");
    expect(module).not.toContain("attachRuntime");
  });
});

const FASTIFY_APP = `import Fastify from "fastify";
import { registerSources } from "@noverax/courier";
import { courierPlugin } from "@noverax/courier-fastify";
import config from "./courier/config.js";

registerSources(config.sources);
${ATTACH_LATER}

const app = Fastify();
await app.register(courierPlugin, { prefix: "/api/request" });
`;

describe("a Fastify server set up already", () => {
  it("is offered nothing", () => {
    expectNothingOffered(
      planOf("fastify", "fastify", serverApp({ fastify: "^5.6.0" }, { "src/app.ts": FASTIFY_APP })),
    );
  });

  it("is offered the registration, in its own file, where it registers other sources", () => {
    const plan = planOf(
      "fastify",
      "fastify",
      serverApp(
        { fastify: "^5.6.0" },
        {
          "src/app.ts": FASTIFY_APP.replace(
            "registerSources(config.sources);",
            "registerSources(config.legacy);",
          ),
        },
      ),
    );

    expect(offered(plan)).toEqual(["step src/app.ts"]);
    expect(stepLines(plan, "src/app.ts")).toContain('import config from "./courier/config";');
    expect(stepLines(plan, "src/app.ts")).toContain("registerSources(config.sources);");
  });
});

const HONO_APP = `import { Hono } from "hono";
import { registerSources } from "@noverax/courier";
import { courierHandler } from "@noverax/courier-hono";
import config from "./courier/config";

registerSources(config.sources);
${ATTACH_LATER}

const app = new Hono();
app.all("/api/request", courierHandler());

export default app;
`;

describe("a Hono server set up already", () => {
  it("is offered nothing, and its tsconfig is left as it is", () => {
    expectNothingOffered(
      planOf(
        "hono",
        "hono",
        serverApp(
          { hono: "^4.9.0" },
          {
            "src/index.ts": HONO_APP,
            "tsconfig.json": '{ "compilerOptions": { "rootDir": "./src" } }',
          },
        ),
      ),
    );
  });

  it("is offered only the server's Studio connection where it is commented out", () => {
    const plan = planOf(
      "hono",
      "hono",
      serverApp(
        { hono: "^4.9.0" },
        { "src/index.ts": HONO_APP.replace(ATTACH_LATER, `// ${ATTACH_LATER}`) },
      ),
    );

    expect(offered(plan)).toEqual(["step src/index.ts"]);
    expect(stepLines(plan, "src/index.ts")).toContain("attachRuntime");
    expect(stepLines(plan, "src/index.ts")).not.toContain("registerSources");
  });
});

const EXPRESS_APP = `import express from "express";
import { registerSources } from "@noverax/courier";
import { courierHandler } from "@noverax/courier-express";
import config from "./courier/config";

registerSources(config.sources);
${ATTACH_LATER}

const app = express();
app.all("/api/request", courierHandler());
app.listen(3000);
`;

describe("an Express server set up already", () => {
  it("is offered nothing", () => {
    expectNothingOffered(
      planOf(
        "express",
        "express",
        serverApp({ express: "^5.1.0" }, { "src/server.ts": EXPRESS_APP }),
      ),
    );
  });

  it("is offered the proxy route alone where it registers and connects Studio, but serves no proxy", () => {
    const plan = planOf(
      "express",
      "express",
      serverApp(
        { express: "^5.1.0" },
        {
          "src/server.ts": EXPRESS_APP.replace('app.all("/api/request", courierHandler());\n', ""),
        },
      ),
    );

    expect(offered(plan)).toEqual(["create src/courier/routes.ts", "edit src/server.ts"]);
    const routes = plan.files.find((file) => file.path === "src/courier/routes.ts")?.content;
    expect(routes).toContain('courier.all("/api/request", courierHandler());');
    expect(routes).not.toContain("registerSources");
    expect(routes).not.toContain("attachRuntime");
    expect(routes).not.toContain('/courier"');
  });
});

describe("a React or Vue app Vite builds, set up already", () => {
  const app = (framework: Record<string, string>, vite: string) => ({
    "package.json": manifestWith({ vite: "^7.1.0", ...framework }),
    "tsconfig.json": "{}",
    "courier.config.ts": CONFIG,
    "vite.config.ts": vite,
  });

  it("is offered nothing, Studio's plugin from its framework's entry or from Vite's", () => {
    expectNothingOffered(
      planOf(
        "react",
        "vite",
        app(
          { react: "19.2.0" },
          'import react from "@vitejs/plugin-react";\nimport { courierStudio } from "@noverax/courier-studio/react";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({ plugins: [react(), courierStudio()] });\n',
        ),
      ),
    );
    expectNothingOffered(
      planOf(
        "vue",
        "vite",
        app(
          { vue: "^3.5.0" },
          'import { courierStudio } from "@noverax/courier-studio/vite";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({ plugins: [courierStudio()] });\n',
        ),
      ),
    );
  });

  it("is given the plugin where it is imported but commented out, without a second import", () => {
    const plan = planOf(
      "react",
      "vite",
      app(
        { react: "19.2.0" },
        'import react from "@vitejs/plugin-react";\nimport { courierStudio } from "@noverax/courier-studio/react";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({ plugins: [react() /* , courierStudio() */] });\n',
      ),
    );
    const edit = plan.edits.find((each) => each.path === "vite.config.ts");

    expect(offered(plan)).toEqual(["edit vite.config.ts"]);
    expect(edit?.after.match(/import \{ courierStudio \}/g)).toHaveLength(1);
    expect(edit?.after).toContain("plugins: [react(), courierStudio()");
  });

  it("is given the plugin and its import where the config names it in a string alone", () => {
    const plan = planOf(
      "vue",
      "vite",
      app(
        { vue: "^3.5.0" },
        'import { defineConfig } from "vite";\n\nconst note = "courierStudio() from @noverax/courier-studio/vue";\n\nexport default defineConfig({ plugins: [] });\n',
      ),
    );
    const edit = plan.edits.find((each) => each.path === "vite.config.ts");

    expect(offered(plan)).toEqual(["edit vite.config.ts"]);
    expect(edit?.after).toContain('import { courierStudio } from "@noverax/courier-studio/vue";');
  });
});
