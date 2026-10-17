/**
 * The changes the command makes to a file of the project's never bind a
 * name twice, nor mount twice what the file has already: a router
 * imported through one of the project's aliases counts as mounted, and
 * where the command cannot tell, the change is left to the person.
 */
import { afterAll, describe, expect, it } from "vitest";

import type { Plan } from "../../src/plan/build-plan";
import { manifestWith, offered, planAt, setUp, write } from "./configured-fixture";
import { removeProjects } from "./project-fixture";

afterAll(removeProjects);

/* The plan's change to a file, as the file would read after it. */
function after(plan: Plan, path: string): string | undefined {
  return plan.edits.find((edit) => edit.path === path && edit.state === "edit")?.after;
}

const EXPRESS = 'import express from "express";\n\nconst app = express();\napp.listen(3000);\n';

describe("an Express server whose routes are mounted through an alias", () => {
  const mounted = (specifier: string) =>
    `import express from "express";\nimport { courier } from "${specifier}";\n\nconst app = express();\napp.use(courier);\napp.listen(3000);\n`;

  it("counts tsconfig paths, package.json imports and baseUrl, and is offered nothing", () => {
    const cases = [
      {
        tsconfig: '{ "compilerOptions": { "paths": { "@server/*": ["./src/*"] } } }',
        specifier: "@server/courier/routes",
        imports: undefined,
      },
      {
        tsconfig: "{}",
        specifier: "#courier/routes",
        imports: { "#courier/*": "./src/courier/*.ts" },
      },
      {
        tsconfig: '{ "compilerOptions": { "baseUrl": "src" } }',
        specifier: "courier/routes",
        imports: undefined,
      },
    ];
    for (const { tsconfig, specifier, imports } of cases) {
      const manifest = {
        ...JSON.parse(manifestWith({ express: "^5.1.0" })),
        ...(imports ? { imports } : {}),
      };
      const root = setUp("express", "express", {
        "package.json": JSON.stringify(manifest),
        "tsconfig.json": tsconfig,
        "src/server.ts": EXPRESS.replace("const app = express();", "export const app = express();"),
      });
      write(root, { "src/server.ts": mounted(specifier) });
      const plan = planAt(root, "express", "express");

      expect(offered(plan)).toEqual([]);
      expect(after(plan, "src/server.ts")).toBeUndefined();
    }
  });

  it("leaves the mount to the person, without a second import, where the name is taken by an import it cannot resolve", () => {
    const root = setUp("express", "express", {
      "package.json": manifestWith({ express: "^5.1.0" }),
      "tsconfig.json": "{}",
      "src/server.ts": "export const app = 1;\n",
    });
    write(root, { "src/server.ts": mounted("virtual:courier-routes") });
    const plan = planAt(root, "express", "express");

    expect(offered(plan)).toEqual(["step your server"]);
    expect(after(plan, "src/server.ts")).toBeUndefined();
  });

  it("mounts the routes where nothing loads them and the name is free", () => {
    const root = setUp("express", "express", {
      "package.json": manifestWith({ express: "^5.1.0" }),
      "tsconfig.json": "{}",
      "src/server.ts": "export const app = 1;\n",
    });
    write(root, { "src/server.ts": EXPRESS });
    const changed = after(planAt(root, "express", "express"), "src/server.ts");

    expect(changed?.match(/import \{ courier \}/g)).toHaveLength(1);
    expect(changed?.match(/app\.use\(courier\)/g)).toHaveLength(1);
  });
});

describe("a Hono server and a NestJS app with the name taken", () => {
  it("leaves Hono's mount to the person where `courier` is bound to something else", () => {
    const root = setUp("hono", "hono", {
      "package.json": manifestWith({ hono: "^4.9.0" }),
      "tsconfig.json": "{}",
      "src/index.ts": "export const app = 1;\n",
    });
    write(root, {
      "src/index.ts":
        'import { Hono } from "hono";\n\nconst courier = new Hono();\nconst app = new Hono();\napp.route("/", courier);\nexport default app;\n',
    });
    const plan = planAt(root, "hono", "hono");

    expect(offered(plan)).toEqual(["step src/index.ts"]);
    expect(after(plan, "src/index.ts")).toBeUndefined();
  });

  it("leaves NestJS's import to the person where CourierModule comes from a path it cannot resolve", () => {
    const root = setUp("nestjs", "@nestjs/core", {
      "package.json": manifestWith({ "@nestjs/core": "^11.1.0" }),
      "tsconfig.json": "{}",
      "src/app.module.ts":
        'import { Module } from "@nestjs/common";\n\nconst modules = [];\n\n@Module({ imports: modules })\nexport class AppModule {}\n',
    });
    write(root, {
      "src/app.module.ts":
        'import { Module } from "@nestjs/common";\nimport { CourierModule } from "@modules/courier";\n\n@Module({ imports: [] })\nexport class AppModule {}\n',
    });
    const plan = planAt(root, "nestjs", "@nestjs/core");

    expect(offered(plan)).toEqual(["step src/app.module.ts"]);
    expect(after(plan, "src/app.module.ts")).toBeUndefined();
  });

  it("imports Courier's module into NestJS's root module through a tsconfig alias it reads as loaded", () => {
    const root = setUp("nestjs", "@nestjs/core", {
      "package.json": manifestWith({ "@nestjs/core": "^11.1.0" }),
      "tsconfig.json": '{ "compilerOptions": { "paths": { "@modules/*": ["./src/courier/*"] } } }',
      "src/app.module.ts":
        'import { Module } from "@nestjs/common";\n\nconst modules = [];\n\n@Module({ imports: modules })\nexport class AppModule {}\n',
    });
    write(root, {
      "src/app.module.ts":
        'import { Module } from "@nestjs/common";\nimport { CourierModule } from "@modules/courier.module";\n\n@Module({ imports: [CourierModule] })\nexport class AppModule {}\n',
    });

    expect(offered(planAt(root, "nestjs", "@nestjs/core"))).toEqual([]);
  });
});
