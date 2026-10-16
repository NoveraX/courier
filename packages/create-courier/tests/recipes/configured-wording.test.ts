/**
 * What a plan says where Courier is set up: no example's screen to open,
 * Studio loaded under a check of the environment taken as loaded under
 * next dev alone, a file of the person's named once.
 */
import { afterAll, describe, expect, it } from "vitest";

import { expoRecipe } from "../../src/recipes/expo";
import { manifestWith, offered, planAt } from "./configured-fixture";
import { contextOf, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

describe("what is said where Courier is set up", () => {
  it("in Expo, starts the app without sending the person to the example's screen", () => {
    const ctx = contextOf(
      projectWith({
        "package.json": manifestWith({ expo: "~54.0.0", react: "19.1.0" }),
        "tsconfig.json": "{}",
        "app.json": '{ "expo": { "scheme": "shop" } }',
        "courier.config.ts": "export default defineConfig({ sources: { shop } });\n",
      }),
      "expo",
    );

    expect(expoRecipe(ctx).next.map((step) => step.what)).toEqual([
      "starts Courier Studio on port 6280",
      "starts the app in the browser",
    ]);
  });

  it("in Next.js, takes Studio loaded under a check of NODE_ENV as loaded under next dev alone", () => {
    const plan = planAt(
      projectWith({
        "package.json": manifestWith({ next: "15.5.9", react: "19.1.0" }),
        "tsconfig.json": "{}",
        "next.config.mjs":
          'const nextConfig = {};\n\nexport default async function config() {\n  if (process.env.NODE_ENV !== "development") return nextConfig;\n  const { withCourierStudio } = await import("@noverax/courier-studio/next");\n  return withCourierStudio()(nextConfig);\n}\n',
        "courier.config.ts": "export default defineConfig({ sources: { shop } });\n",
        "instrumentation.ts":
          'import { registerSources } from "@noverax/courier";\nexport async function register() {\n  const { default: config } = await import("./courier.config");\n  registerSources(config.sources);\n  const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");\n  await attachRuntime();\n}\n',
        "app/api/request/route.ts":
          'import { apiRoute } from "@noverax/courier-next";\nexport const { GET, POST } = apiRoute();\n',
      }),
      "next",
      "next",
    );

    expect(offered(plan)).toEqual([]);
  });

  it("names a file of the person's where Courier's proxy route would go once, as Courier's", () => {
    const plan = planAt(
      projectWith({
        "package.json": manifestWith({ express: "^5.1.0" }),
        "tsconfig.json": "{}",
        "courier.config.ts": "export default defineConfig({ sources: { shop } });\n",
        "src/courier/routes.ts": "export const routes = [];\n",
        "src/index.ts": 'import express from "express";\n\nconst app = express();\n',
      }),
      "express",
      "express",
    );
    const kept = plan.manual.find((each) => each.file === "src/courier/routes.ts");

    expect(kept?.what).toContain("Courier's proxy route would hold");
    expect(kept?.what).not.toContain("Courier's Courier's");
  });
});
