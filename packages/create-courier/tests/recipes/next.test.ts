import { afterAll, describe, expect, it } from "vitest";

import { buildPlan } from "../../src/plan/build-plan";
import { nextRecipe } from "../../src/recipes/next";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const NEXT_CONFIG = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
};

export default nextConfig;
`;

function app(extra: Record<string, string> = {}, next = "16.4.0") {
  return projectWith({
    "package.json": manifest({ next, react: "19.2.0" }),
    "tsconfig.json": "{}",
    "next.config.ts": NEXT_CONFIG,
    "src/app/page.tsx": "export default function Home() { return null; }\n",
    ...extra,
  });
}

describe("nextRecipe", () => {
  it("registers the APIs in instrumentation.ts and serves them from the route", () => {
    const recipe = nextRecipe(contextOf(app(), "next"));
    const byPath = new Map(recipe.files.map((file) => [file.path, file.content]));

    expect([...byPath.keys()]).toEqual([
      "src/courier/api.ts",
      "courier.routes.ts",
      "courier.config.ts",
      "courier.mocks.ts",
      "src/app/api/request/route.ts",
      "src/courier/query.ts",
      "src/app/courier/page.tsx",
      "src/instrumentation.ts",
      "src/instrumentation-client.ts",
    ]);
    expect(byPath.get("src/instrumentation.ts")).toContain('await import("../courier.config")');
    expect(byPath.get("src/instrumentation.ts")).toContain("registerSources(config.sources);");
    expect(byPath.get("src/instrumentation.ts")).toContain("await attachRuntime();");
    expect(byPath.get("src/app/api/request/route.ts")).not.toContain("registerSources");
    expect(byPath.get("src/app/courier/page.tsx")?.startsWith('"use client";')).toBe(true);
    expect(byPath.get("src/courier/api.ts")).toContain("  expose: true,");
    expect(byPath.get("src/courier/query.ts")).toContain(
      'import { apiRoutes } from "../../courier.routes";',
    );
    expect(byPath.get("src/courier/query.ts")).toContain("createProxyQueryCaller(apiRoutes)");
    expect(recipe.edits).toEqual([]);
  });

  it("leaves the lines to the person where the app has an instrumentation file of its own", () => {
    const recipe = nextRecipe(
      contextOf(app({ "src/instrumentation.ts": "export function register() {}\n" }), "next"),
    );

    expect(recipe.files.map((file) => file.path)).not.toContain("src/instrumentation.ts");
    expect(recipe.manual[0]?.file).toBe("src/instrumentation.ts");
    expect(recipe.manual[0]?.lines.join("\n")).toContain("registerSources(config.sources);");
  });

  it("names Studio's port in next.config's env where Studio could not take the default", () => {
    const ctx = contextOf(app(), "next", {}, { studio: 6281, mock: 7001 });
    const plan = buildPlan(ctx, nextRecipe(ctx));
    const edit = plan.edits.find((planned) => planned.path === "next.config.ts");

    expect(edit?.state).toBe("edit");
    expect(edit?.after).toContain(
      'cacheComponents: true,\n  env: { COURIER_STUDIO_URL: "http://localhost:6281" },\n};',
    );
  });

  it("connects the browser through the config's wrapper before Next.js 16, imported by next dev alone", () => {
    const recipe = nextRecipe(contextOf(app({}, "15.5.0"), "next"));
    const step = recipe.manual.find((each) => each.file === "next.config.ts");

    expect(recipe.files.map((file) => file.path)).not.toContain("src/instrumentation-client.ts");
    expect(step?.lines).toEqual([
      "export default async function config(phase: string): Promise<NextConfig> {",
      "  // PHASE_DEVELOPMENT_SERVER: next dev alone loads Studio, a dev dependency",
      '  if (phase !== "phase-development-server") return nextConfig;',
      '  const { withCourierStudio } = await import("@noverax/courier-studio/next");',
      "  return withCourierStudio()(nextConfig);",
      "}",
    ]);
  });

  it("writes the wrapper for a CommonJS next.config.js as CommonJS", () => {
    const root = projectWith({
      "package.json": manifest({ next: "14.2.0", react: "18.3.1" }),
      "tsconfig.json": "{}",
      "next.config.js":
        "/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nmodule.exports = nextConfig;\n",
      "src/app/page.tsx": "export default function Home() { return null; }\n",
    });
    const step = nextRecipe(contextOf(root, "next")).manual.find(
      (each) => each.file === "next.config.js",
    );

    expect(step?.lines[0]).toBe("module.exports = async function config(phase) {");
    expect(step?.lines.at(-1)).toBe("};");
  });

  it("adds neither Studio's files nor its script without Studio", () => {
    const recipe = nextRecipe(contextOf(app(), "next", { studio: false }));

    expect(recipe.files.map((file) => file.path)).not.toContain("src/instrumentation-client.ts");
    expect(
      recipe.files.find((file) => file.path === "src/instrumentation.ts")?.content,
    ).not.toContain("attachRuntime");
    expect(recipe.scripts).toEqual({ routes: "courier-cli routes" });
    expect(recipe.devDependencies.filter((name) => name.includes("courier-studio"))).toEqual([]);
  });

  it("adds the CLI that writes courier.routes.ts and its script, and the step that runs it where no Studio does", () => {
    const withStudio = nextRecipe(contextOf(app(), "next"));
    const without = nextRecipe(contextOf(app(), "next", { studio: false }));

    for (const recipe of [withStudio, without])
      expect(
        recipe.devDependencies.filter((name) => name.startsWith("@noverax/courier-cli")),
      ).toHaveLength(1);
    expect(withStudio.scripts).toEqual({ studio: "courier-studio", routes: "courier-cli routes" });
    expect(withStudio.next.map((step) => step.command)).toEqual(["npm run studio", "npm run dev"]);
    expect(without.next.map((step) => step.command)).toEqual(["npm run routes", "npm run dev"]);
  });

  it("runs the CLI itself where a script of the project's own is named routes", () => {
    const root = projectWith({
      "package.json": manifest(
        { next: "16.4.0", react: "19.2.0" },
        { scripts: { routes: "tsr generate" } },
      ),
      "tsconfig.json": "{}",
      "next.config.ts": NEXT_CONFIG,
    });

    const recipe = nextRecipe(contextOf(root, "next", { studio: false }));

    expect(recipe.next.map((step) => step.command)).toContain("npm exec -- courier-cli routes");
  });
});
