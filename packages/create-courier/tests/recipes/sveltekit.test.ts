import { afterAll, describe, expect, it } from "vitest";

import { buildPlan } from "../../src/plan/build-plan";
import { svelteKitRecipe } from "../../src/recipes/sveltekit";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const VITE = `import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
\tplugins: [sveltekit()]
});
`;

function app(extra: Record<string, string> = {}) {
  return projectWith({
    "package.json": manifest({ "@sveltejs/kit": "^3.0.0", svelte: "^5.57.1" }),
    "tsconfig.json": "{}",
    "vite.config.ts": VITE,
    ...extra,
  });
}

describe("svelteKitRecipe", () => {
  it("registers the APIs in hooks.server.ts, serves them at /api/request and adds a runes page", () => {
    const ctx = contextOf(app(), "@sveltejs/kit");
    const recipe = svelteKitRecipe(ctx);
    const byPath = new Map(recipe.files.map((file) => [file.path, file.content]));

    expect(byPath.get("src/hooks.server.ts")).toContain('import config from "../courier.config";');
    expect(byPath.get("src/hooks.server.ts")).toContain("if (import.meta.env.DEV) {");
    expect(byPath.get("src/routes/api/request/+server.ts")).toContain(
      "export const POST = handler;",
    );
    expect(byPath.get("src/routes/courier/+page.svelte")).toContain(
      "let users = $state<User[]>();",
    );
    expect(byPath.get("src/lib/courier/api.ts")).toContain(
      'import.meta.env?.VITE_API_URL ?? "http://localhost:7001"',
    );
    expect(recipe.prepare).toEqual([{ bin: "svelte-kit", args: ["sync"] }]);
    expect(buildPlan(ctx, recipe).edits[0]?.after).toContain(
      "plugins: [sveltekit(), courierStudio()]",
    );
  });

  it("writes Svelte 4's syntax before Svelte 5", () => {
    const root = projectWith({
      "package.json": manifest({ "@sveltejs/kit": "^2.0.0", svelte: "^4.2.0" }),
      "tsconfig.json": "{}",
    });
    const page = svelteKitRecipe(contextOf(root, "@sveltejs/kit")).files.find((file) =>
      file.path.endsWith("+page.svelte"),
    );

    expect(page?.content).toContain("let users: User[] | undefined;");
    expect(page?.content).toContain("<form on:submit={add}>");
  });

  it("leaves the lines to the person where the app has hooks of its own", () => {
    const recipe = svelteKitRecipe(
      contextOf(
        app({ "src/hooks.server.js": "export const handle = () => {};\n" }),
        "@sveltejs/kit",
      ),
    );

    expect(recipe.manual[0]?.file).toBe("src/hooks.server.js");
  });
});
