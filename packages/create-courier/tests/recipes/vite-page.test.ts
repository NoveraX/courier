import { afterAll, describe, expect, it } from "vitest";

import { packageManager } from "../../src/project/package-manager";
import { reactViteRecipe } from "../../src/recipes/react-vite";
import type { Recipe, RecipeContext } from "../../src/recipes/recipe-types";
import { vueViteRecipe } from "../../src/recipes/vue-vite";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const VITE_APPS = [
  { name: "React", recipe: reactViteRecipe, framework: { react: "^19.2.0" }, mount: "root" },
  { name: "Vue", recipe: vueViteRecipe, framework: { vue: "^3.5.0" }, mount: "app" },
] as const;

type ViteApp = (typeof VITE_APPS)[number];

function viteApp(app: ViteApp, scripts: Readonly<Record<string, string>> = { dev: "vite" }) {
  return projectWith({
    "package.json": manifest({ vite: "^8.3.0", ...app.framework }, { scripts }),
    "tsconfig.json": "{}",
  });
}

function pageOf(recipe: Recipe) {
  const page = recipe.files.find((file) => file.path === "courier.html");
  if (page === undefined) throw new Error("the recipe adds no courier.html");
  return page;
}

/* What a page shows before its script renders anything, as text: the inside of its mount node. */
function mountText(html: string, mount: string): string {
  const inside = new RegExp(`<div id="${mount}">([\\s\\S]*?)</div>`).exec(html)?.[1] ?? "";
  return inside
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe.each(VITE_APPS)("the page a $name app gets", (app) => {
  it("says how to see it, inside the node it renders into, for the page opened from disk", () => {
    const html = pageOf(app.recipe(contextOf(viteApp(app), "vite"))).content;

    expect(html).toContain('<script type="module" src="/src/courier/main.');
    expect(mountText(html, app.mount)).toBe(
      "This page is served by Vite while you develop: run npm run dev and open /courier.html at the address it prints.",
    );
  });

  it("names the command with the project's package manager and dev script", () => {
    const ctx: RecipeContext = {
      ...contextOf(viteApp(app, { "start:dev": "vite" }), "vite"),
      manager: packageManager("pnpm"),
    };

    expect(mountText(pageOf(app.recipe(ctx)).content, app.mount)).toContain("run pnpm start:dev");
  });

  it("tells the plan the page opens under the dev server, not from disk", () => {
    expect(pageOf(app.recipe(contextOf(viteApp(app), "vite"))).purpose).toBe(
      "the page Vite serves at /courier.html while npm run dev runs; it does not open from disk",
    );
  });

  it("gives the page's full address in the next step, and the one Vite prints beside it", () => {
    const next = app.recipe(contextOf(viteApp(app), "vite")).next.at(-1);

    expect(next).toEqual({
      command: "npm run dev",
      what: "starts the app: open http://localhost:5173/courier.html, or the address Vite prints",
    });
  });

  it("takes the port the dev script names", () => {
    const ctx = contextOf(viteApp(app, { dev: "vite --port 3001 --host" }), "vite");

    expect(app.recipe(ctx).next.at(-1)?.what).toContain("http://localhost:3001/courier.html");
  });
});
