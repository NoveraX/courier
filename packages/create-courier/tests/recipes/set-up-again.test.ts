/**
 * A project the command set up, run again: a file of Courier's that serves
 * the proxy, or registers the APIs, does its part only once the app loads
 * it — until then the step that has the app load it stays; once it does,
 * nothing is left. The same for a file of the project's own; and the lines
 * a file of the project's that starts Courier is given.
 */
import { afterAll, describe, expect, it } from "vitest";

import { manifestWith, offered, planAt, RANGE, setUp, write } from "./configured-fixture";
import { projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

describe("a server set up by the command, run again", () => {
  it("in Fastify, keeps registering the plugin until the app registers it", () => {
    const root = setUp("fastify", "fastify", {
      "package.json": manifestWith({ fastify: "^5.6.0" }),
      "tsconfig.json": "{}",
      "src/app.ts": 'import Fastify from "fastify";\n\nexport const app = Fastify();\n',
    });

    expect(offered(planAt(root, "fastify", "fastify"))).toEqual(["step your server"]);
    write(root, {
      "src/app.ts":
        'import Fastify from "fastify";\nimport courier from "./courier/plugin";\n\nexport const app = Fastify();\nawait app.register(courier);\n',
    });
    expect(offered(planAt(root, "fastify", "fastify"))).toEqual([]);
  });

  it("in Express and Hono, keeps mounting the routes until the app mounts them", () => {
    const express = setUp("express", "express", {
      "package.json": manifestWith({ express: "^5.1.0" }),
      "tsconfig.json": "{}",
      "src/index.ts": 'import express from "express";\n\nexport const app = express();\n',
    });
    const hono = setUp("hono", "hono", {
      "package.json": manifestWith({ hono: "^4.9.0" }),
      "tsconfig.json": "{}",
      "src/index.ts": 'import { Hono } from "hono";\n\nexport const app = new Hono();\n',
    });

    expect(offered(planAt(express, "express", "express"))).toEqual(["step src/index.ts"]);
    expect(offered(planAt(hono, "hono", "hono"))).toEqual(["step src/index.ts"]);
    write(express, {
      "src/index.ts":
        'import express from "express";\nimport { courier } from "./courier/routes";\n\nexport const app = express();\napp.use(courier);\n',
    });
    write(hono, {
      "src/index.ts":
        'import { Hono } from "hono";\nimport { courier } from "./courier/routes";\n\nexport const app = new Hono();\napp.route("/", courier);\n',
    });
    expect(offered(planAt(express, "express", "express"))).toEqual([]);
    expect(offered(planAt(hono, "hono", "hono"))).toEqual([]);
  });

  it("in NestJS, keeps importing Courier's module until the root module imports it", () => {
    const root = setUp("nestjs", "@nestjs/core", {
      "package.json": manifestWith({ "@nestjs/core": "^11.1.0" }),
      "tsconfig.json": "{}",
      "src/app.module.ts":
        'import { Module } from "@nestjs/common";\n\nconst modules = [];\n\n@Module({ imports: modules })\nexport class AppModule {}\n',
    });

    expect(offered(planAt(root, "nestjs", "@nestjs/core"))).toEqual(["step src/app.module.ts"]);
    write(root, {
      "src/app.module.ts":
        'import { Module } from "@nestjs/common";\nimport { CourierModule } from "./courier/courier.module";\n\n@Module({ imports: [CourierModule] })\nexport class AppModule {}\n',
    });
    expect(offered(planAt(root, "nestjs", "@nestjs/core"))).toEqual([]);
  });

  it("in React Router, keeps listing the route until the routes file lists it, or reads the folder", () => {
    const root = setUp("react-router", "@react-router/dev", {
      "package.json": manifestWith({ "@react-router/dev": "^7.9.0", react: "19.2.0" }),
      "tsconfig.json": "{}",
      "vite.config.ts":
        'import { courierStudio } from "@noverax/courier-studio/remix";\n\nexport default defineConfig({ plugins: [courierStudio()] });\n',
      "app/routes.ts": "export default routes;\n",
    });

    expect(offered(planAt(root, "react-router", "@react-router/dev"))).toEqual([
      "step app/routes.ts",
    ]);
    write(root, {
      "app/routes.ts":
        'import { flatRoutes } from "@react-router/fs-routes";\n\nexport default flatRoutes();\n',
    });
    expect(offered(planAt(root, "react-router", "@react-router/dev"))).toEqual([]);
  });
});

describe("a file of the project's that serves the proxy where nothing loads it", () => {
  const ROUTER =
    'import { Router } from "express";\nimport { registerSources } from "@noverax/courier";\nimport { courierHandler } from "@noverax/courier-express";\nimport config from "../courier.config";\n\nregisterSources(config.sources);\nimport("@noverax/courier-studio-core/runtime").then(({ attachRuntime }) => attachRuntime());\n\nexport const proxy = Router();\nproxy.all("/api/request", courierHandler());\n';

  it("is named, and the step to load it stays; once loaded, nothing is", () => {
    const files = {
      "package.json": manifestWith({ express: "^5.1.0" }),
      "tsconfig.json": "{}",
      "courier.config.ts": "export default defineConfig({ sources: { shop } });\n",
      "lib/proxy.ts": ROUTER,
      "src/index.ts": 'import express from "express";\n\nconst app = express();\n',
    };
    const alone = projectWith(files);
    const loaded = projectWith({
      ...files,
      "src/index.ts":
        'import express from "express";\nimport { proxy } from "../lib/proxy";\n\nconst app = express();\napp.use(proxy);\n',
    });
    const plan = planAt(alone, "express", "express");

    expect(offered(plan)).toEqual(["step lib/proxy.ts"]);
    expect(plan.manual[0]?.what).toContain(
      "no file of the app loads this one: mount its routes on your Express app",
    );
    expect(plan.files.map((file) => file.path)).toContain("lib/proxy.ts");
    expect(offered(planAt(loaded, "express", "express"))).toEqual([]);
  });

  it("in React Router, is listed by the path it has", () => {
    const root = projectWith({
      "package.json": manifestWith({ "@react-router/dev": "^7.9.0", react: "19.2.0" }),
      "tsconfig.json": "{}",
      "courier.config.ts": "export default defineConfig({ sources: { shop } });\n",
      "vite.config.ts":
        'import { courierStudio } from "@noverax/courier-studio/remix";\n\nexport default defineConfig({ plugins: [courierStudio()] });\n',
      "app/routes.ts":
        'import { index, route } from "@react-router/dev/routes";\n\nexport default [index("routes/home.tsx")];\n',
      "app/routes/api.courier.ts": ROUTER.replace(
        "@noverax/courier-express",
        "@noverax/courier-remix",
      ).replace("../courier.config", "../../courier.config"),
    });
    const plan = planAt(root, "react-router", "@react-router/dev");

    expect(offered(plan)).toEqual(["edit app/routes.ts"]);
    expect(plan.edits.find((edit) => edit.path === "app/routes.ts")?.after).toContain(
      'route("api/request", "routes/api.courier.ts")',
    );
  });
});

describe("a file that registers the APIs", () => {
  it("counts once something loads it, and is named in the plan", () => {
    const boot =
      'import { registerSources } from "@noverax/courier";\nimport config from "../../../courier.config";\n\nregisterSources(config.sources);\nif (import.meta.env.DEV) {\n  const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");\n  await attachRuntime();\n}\n';
    const files = {
      "package.json": manifestWith({
        "@sveltejs/kit": "^2.40.0",
        "@noverax/courier-sveltekit": RANGE,
      }),
      "tsconfig.json": "{}",
      "courier.config.ts": "export default defineConfig({ sources: { shop } });\n",
      "vite.config.ts":
        'import { courierStudio } from "@noverax/courier-studio/sveltekit";\n\nexport default defineConfig({ plugins: [courierStudio()] });\n',
      "src/routes/api/request/+server.ts":
        'import { courierHandler } from "@noverax/courier-sveltekit";\n\nexport const GET = courierHandler();\n',
      "src/lib/server/boot.ts": boot,
    };
    const alone = planAt(projectWith(files), "sveltekit", "@sveltejs/kit");
    const loaded = planAt(
      projectWith({ ...files, "src/routes/+layout.server.ts": 'import "$lib/server/boot";\n' }),
      "sveltekit",
      "@sveltejs/kit",
    );

    expect(offered(alone)).toEqual(["create src/hooks.server.ts"]);
    expect(offered(loaded)).toEqual([]);
    expect(loaded.files.map((file) => file.path)).toContain("src/lib/server/boot.ts");
  });
});

describe("lines for a file of the project's that starts Courier", () => {
  it("in Next.js, gives the lines for the register() its instrumentation.ts has", () => {
    const plan = planAt(
      projectWith({
        "package.json": manifestWith({ next: "16.4.0", react: "19.2.0" }),
        "tsconfig.json": "{}",
        "next.config.ts": "export default {};\n",
        "courier.config.ts": "export default defineConfig({ sources: { shop } });\n",
        "instrumentation.ts":
          'export async function register() {\n  await import("./tracing");\n}\n',
        "instrumentation-client.ts":
          'import { attachRuntime } from "@noverax/courier-studio-core/runtime";\nattachRuntime("next-browser");\n',
        "app/api/request/route.ts":
          'import { apiRoute } from "@noverax/courier-next";\nexport const { GET, POST } = apiRoute();\n',
      }),
      "next",
      "next",
    );
    const step = plan.manual.find((each) => each.file === "instrumentation.ts");

    expect(step?.what).toContain(
      "the import at the top, the rest inside the register() it exports",
    );
    expect(step?.lines).not.toContain("export async function register() {");
    expect(step?.lines).toContain("registerSources(config.sources);");
    expect(step?.lines.join("\n")).not.toMatch(/return;/);
    expect(step?.what).not.toContain("made async");
  });

  it("in Hono compiled from src/ alone, does not import a config outside it", () => {
    const plan = planAt(
      projectWith({
        "package.json": manifestWith({ hono: "^4.9.0" }),
        "tsconfig.json": '{ "compilerOptions": { "rootDir": "./src" }, "include": ["src"] }',
        "courier.config.ts": "export default defineConfig({ sources: { shop } });\n",
        "src/index.ts":
          'import { Hono } from "hono";\nimport { courierHandler } from "@noverax/courier-hono";\n\nconst app = new Hono();\napp.all("/api/request", courierHandler());\nexport default app;\n',
      }),
      "hono",
      "hono",
    );
    const step = plan.manual.find((each) => each.file === "src/index.ts");

    expect(step?.what).toContain("TypeScript compiles src/ alone");
    expect(step?.lines).toContain('import config from "./courier/config";');
  });

  it("in Express compiled from src/ alone, writes no file that imports a config outside it", () => {
    const plan = planAt(
      projectWith({
        "package.json": manifestWith({ express: "^5.1.0" }),
        "tsconfig.json": '{ "compilerOptions": { "rootDir": "./src" }, "include": ["src"] }',
        "courier.config.ts": "export default defineConfig({ sources: { shop } });\n",
        "src/index.ts":
          'import express from "express";\n\nconst app = express();\napp.listen(3000);\n',
      }),
      "express",
      "express",
    );
    const routes = plan.files.find((file) => file.path.endsWith("/routes.ts"));
    const step = plan.manual.find((each) => each.file === routes?.path);

    expect(routes?.path.startsWith("src/")).toBe(true);
    expect(routes?.content).not.toContain("courier.config");
    expect(routes?.content).not.toContain("registerSources");
    expect(step?.what).toContain("TypeScript compiles src/ alone");
    expect(step?.lines).toContain("registerSources(config.sources);");
  });
});
