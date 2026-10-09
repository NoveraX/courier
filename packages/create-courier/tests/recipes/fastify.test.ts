import { afterAll, describe, expect, it } from "vitest";

import { buildPlan } from "../../src/plan/build-plan";
import { fastifyRecipe } from "../../src/recipes/fastify";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const SCRIPTS = {
  "dev:start": "fastify start --ignore-watch=.ts$ -w -l info -P dist/app.js",
  test: "node --test",
};

describe("fastifyRecipe", () => {
  it("adds a plugin fastify-cli loads by itself, and keeps .courier/ out of its watcher", () => {
    const root = projectWith({
      "package.json": manifest(
        { fastify: "^5.0.0", "@fastify/autoload": "^6.0.0" },
        { scripts: SCRIPTS },
      ),
      "tsconfig.json": "{}",
      "src/plugins/support.ts": "export default {};\n",
    });
    const ctx = contextOf(root, "fastify");
    const recipe = fastifyRecipe(ctx);
    const plugin = recipe.files.find((file) => file.path === "src/plugins/courier.ts");
    const scripts = buildPlan(ctx, recipe).edits.find((edit) => edit.path === "package.json");

    expect(plugin?.content).toContain('return reply.redirect("/courier", 303);');
    expect(recipe.manual).toEqual([]);
    expect(scripts?.after).toContain(
      '"dev:start": "fastify start --ignore-watch=\\".ts$ .courier\\" -w -l info -P dist/app.js"',
    );
    expect(scripts?.after).toContain('"test": "node --test"');
  });

  it("puts the plugin beside Courier's modules elsewhere, for the person to register, in Fastify 4's order", () => {
    const root = projectWith({
      "package.json": manifest({ fastify: "^4.28.0" }),
      "tsconfig.json": "{}",
      "src/server.ts": "",
    });
    const recipe = fastifyRecipe(contextOf(root, "fastify"));

    expect(recipe.files.find((file) => file.path === "src/courier/plugin.ts")?.content).toContain(
      'reply.redirect(303, "/courier")',
    );
    expect(recipe.manual[0]?.lines).toEqual([
      'import courier from "./src/courier/plugin";',
      "await app.register(courier);",
    ]);
  });
});
