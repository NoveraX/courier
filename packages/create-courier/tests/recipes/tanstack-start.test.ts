import { afterAll, describe, expect, it } from "vitest";

import { detectFramework } from "../../src/frameworks";
import { generatorFor } from "../../src/new-project/generators";
import { buildPlan } from "../../src/plan/build-plan";
import { readProject } from "../../src/project/read-project";
import {
  tanstackStartReactRecipe,
  tanstackStartSolidRecipe,
} from "../../src/recipes/tanstack-start";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const REACT_VITE = `import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackStart(), viteReact()],
});
`;

const SOLID_VITE = `import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import { defineConfig } from "vite";
import viteSolid from "vite-plugin-solid";

export default defineConfig({
  plugins: [tanstackStart(), viteSolid({ ssr: true })],
});
`;

function reactApp(extra: Record<string, string> = {}) {
  return projectWith({
    "package.json": manifest({
      "@tanstack/react-router": "^1.170.46",
      "@tanstack/react-start": "^1.169.4",
      "@vitejs/plugin-react": "^6.2.1",
      react: "^19.3.1",
      "react-dom": "^19.3.1",
      vite: "^8.3.6",
    }),
    "tsconfig.json": "{}",
    "vite.config.ts": REACT_VITE,
    ...extra,
  });
}

function solidApp(extra: Record<string, string> = {}) {
  return projectWith({
    "package.json": manifest({
      "@tanstack/solid-router": "^1.170.43",
      "@tanstack/solid-start": "^1.169.4",
      "solid-js": "^1.9.17",
      vite: "^8.3.6",
      "vite-plugin-solid": "^2.11.15",
    }),
    "tsconfig.json": "{}",
    "vite.config.ts": SOLID_VITE,
    ...extra,
  });
}

const contents = (files: readonly { path: string; content: string }[]) =>
  new Map(files.map((file) => [file.path, file.content]));

describe("TanStack Start for React", () => {
  it("is told by @tanstack/react-start, before React with Vite, which it lists too", () => {
    expect(detectFramework(readProject(reactApp()))?.id).toBe("tanstack-start-react");
  });

  it("registers the APIs in the server entry, which hands requests on to TanStack Start's own", () => {
    const recipe = tanstackStartReactRecipe(contextOf(reactApp(), "@tanstack/react-start"));
    const server = contents(recipe.files).get("src/server.ts") ?? "";

    expect(server.split("\n").slice(0, 2)).toEqual([
      'import { registerSources } from "@noverax/courier/server";',
      'import handler from "@tanstack/react-start/server-entry";',
    ]);
    expect(server).toContain('import config from "../courier.config";');
    expect(server).toContain("registerSources(config.sources);");
    expect(server).toContain("if (import.meta.env.DEV) {");
    expect(server.endsWith("\nexport default handler;\n")).toBe(true);
  });

  it("serves them at /api/request, from a route the browser's code holds none of", () => {
    const recipe = tanstackStartReactRecipe(contextOf(reactApp(), "@tanstack/react-start"));

    expect(contents(recipe.files).get("src/routes/api/request.ts")).toBe(
      `import { apiRoute } from "@noverax/courier-tanstack-start";
import { createFileRoute } from "@tanstack/react-router";

/* Courier's proxy route: the browser calls your API through it. */
export const Route = createFileRoute("/api/request")({ server: { handlers: apiRoute() } });
`,
    );
  });

  it("adds a page at /courier that calls the API with React Query, through the route", () => {
    const recipe = tanstackStartReactRecipe(contextOf(reactApp(), "@tanstack/react-start"));
    const byPath = contents(recipe.files);

    expect(byPath.get("src/routes/courier.tsx")).toContain(
      'export const Route = createFileRoute("/courier")({ component: CourierPage });',
    );
    expect(byPath.get("src/routes/courier.tsx")).toContain(
      'import CourierPage from "../courier/page";',
    );
    expect(byPath.get("src/courier/page.tsx")).toContain("export default function CourierPage()");
    expect(byPath.get("src/courier/query.ts")).toContain("createProxyQueryCaller(routes.api)");
    expect(byPath.get("src/courier/api.ts")).toContain(
      'import.meta.env?.VITE_API_URL ?? "http://localhost:7001"',
    );
  });

  it("builds the pages' routes in and connects the browser to Studio in vite.config", () => {
    const ctx = contextOf(reactApp(), "@tanstack/react-start");
    const plan = buildPlan(ctx, tanstackStartReactRecipe(ctx));

    expect(plan.edits[0]?.after).toContain(
      "plugins: [tanstackStart(), viteReact(), courierRoutes(), courierStudio()]",
    );
    expect(plan.edits[0]?.after).toContain(
      'import { courierRoutes } from "@noverax/courier-tanstack-start/plugin";',
    );
  });

  it("builds the app before checking what it added, as TanStack Start writes its routes' types", () => {
    const recipe = tanstackStartReactRecipe(contextOf(reactApp(), "@tanstack/react-start"));

    expect(recipe.prepare).toEqual([{ bin: "vite", args: ["build"] }]);
    expect(recipe.dependencies).toContainEqual(
      expect.stringMatching(/^@noverax\/courier-tanstack-start(@|$)/),
    );
  });

  it("leaves the registering lines to the person where the app has a server entry of its own", () => {
    const own = `import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export default createServerEntry({ fetch: (request) => handler.fetch(request) });
`;
    const recipe = tanstackStartReactRecipe(
      contextOf(reactApp({ "src/server.ts": own }), "@tanstack/react-start"),
    );
    const step = recipe.manual.find((each) => each.file === "src/server.ts");

    expect(recipe.files.map((file) => file.path)).not.toContain("src/server.ts");
    expect(step?.lines).toContain("registerSources(config.sources);");
    expect(step?.lines.join("\n")).not.toContain("export default handler;");
  });
});

describe("TanStack Start for Solid", () => {
  it("is told by @tanstack/solid-start", () => {
    expect(detectFramework(readProject(solidApp()))?.id).toBe("tanstack-start-solid");
  });

  it("takes TanStack Start's and the router's modules for Solid", () => {
    const recipe = tanstackStartSolidRecipe(contextOf(solidApp(), "@tanstack/solid-start"));
    const byPath = contents(recipe.files);

    expect(byPath.get("src/server.ts")).toContain(
      'import handler from "@tanstack/solid-start/server-entry";',
    );
    expect(byPath.get("src/routes/api/request.ts")).toContain(
      'import { createFileRoute } from "@tanstack/solid-router";',
    );
    expect(byPath.get("src/routes/courier.tsx")).toContain(
      'import { createFileRoute } from "@tanstack/solid-router";',
    );
  });

  it("adds a Solid page that calls the API through the route", () => {
    const recipe = tanstackStartSolidRecipe(contextOf(solidApp(), "@tanstack/solid-start"));
    const byPath = contents(recipe.files);

    expect(byPath.get("src/courier/page.tsx")).toContain('from "solid-js";');
    expect(byPath.get("src/courier/page.tsx")).toContain('import { courier } from "./caller";');
    expect(byPath.get("src/courier/caller.ts")).toContain("createProxyCaller(");
  });

  it("builds the routes in Solid's vite.config", () => {
    const ctx = contextOf(solidApp(), "@tanstack/solid-start");
    const plan = buildPlan(ctx, tanstackStartSolidRecipe(ctx));

    expect(plan.edits[0]?.after).toContain(
      "plugins: [tanstackStart(), viteSolid({ ssr: true }), courierRoutes(), courierStudio()]",
    );
  });
});

/* The config TanStack's CLI writes for React with `--build-tool rsbuild`. */
const REACT_RSBUILD = `import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    pluginReact(),
    tanstackStart(),
  ],
})
`;

const SOLID_RSBUILD = `import { defineConfig } from '@rsbuild/core'
import { pluginSolid } from '@rsbuild/plugin-solid'
import { tanstackStart } from '@tanstack/solid-start/plugin/rsbuild'

export default defineConfig({
  plugins: [pluginSolid(), tanstackStart()],
})
`;

const RSBUILD = { "@rsbuild/core": "^2.1.13", "@rsbuild/plugin-react": "^2.1.0" };

function rsbuildApp(
  files: Record<string, string> = { "rsbuild.config.ts": REACT_RSBUILD },
  others: Record<string, string> = {},
) {
  return projectWith({
    "package.json": manifest({
      ...RSBUILD,
      "@tanstack/react-router": "^1.170.46",
      "@tanstack/react-start": "^1.169.4",
      react: "^19.3.1",
      "react-dom": "^19.3.1",
      ...others,
    }),
    "tsconfig.json": "{}",
    ...files,
  });
}

describe("TanStack Start built by Rsbuild", () => {
  it("builds the pages' routes in from rsbuild.config, with /rsbuild's plugin, and edits no Vite config", () => {
    const ctx = contextOf(rsbuildApp(), "@tanstack/react-start");
    const plan = buildPlan(ctx, tanstackStartReactRecipe(ctx));
    const config = plan.edits.find((edit) => edit.path === "rsbuild.config.ts");

    expect(config?.after).toContain(
      "import { courierRoutes } from '@noverax/courier-tanstack-start/rsbuild'\n",
    );
    expect(config?.after).toContain("    tanstackStart(),\n    courierRoutes(),\n  ],");
    expect(plan.edits.map((edit) => edit.path)).not.toContainEqual(
      expect.stringMatching(/^vite\.config/),
    );
  });

  it("prepares with rsbuild build, and leaves Studio's browser to the person, with no step of Vite's", () => {
    const ctx = contextOf(rsbuildApp(), "@tanstack/react-start");
    const plan = buildPlan(ctx, tanstackStartReactRecipe(ctx));
    const studio = plan.manual.find((step) => step.what.includes("Studio"));

    expect(plan.prepare).toEqual([{ bin: "rsbuild", args: ["build"] }]);
    expect(studio?.file).toBe("rsbuild.config.ts");
    expect(studio?.what).toContain("Rsbuild");
    expect(JSON.stringify(plan.manual)).not.toMatch(/vite/i);
  });

  it("reads the API's address from PUBLIC_API_URL, which Rsbuild builds in, naming no variable of Vite's", () => {
    const recipe = tanstackStartReactRecipe(contextOf(rsbuildApp(), "@tanstack/react-start"));

    expect(contents(recipe.files).get("src/courier/api.ts")).toContain(
      'import.meta.env?.PUBLIC_API_URL ?? "http://localhost:7001"',
    );
    expect(recipe.files.map((file) => file.content).join("\n")).not.toContain("VITE_");
  });

  it("is told by its config, whatever its name, or by @rsbuild/core where the app lists no Vite", () => {
    const mjs = contextOf(
      rsbuildApp({ "rsbuild.config.mjs": REACT_RSBUILD }),
      "@tanstack/react-start",
    );
    const unnamed = contextOf(rsbuildApp({}), "@tanstack/react-start");
    const besideVite = contextOf(
      rsbuildApp({ "vite.config.ts": REACT_VITE }, { vite: "^8.3.6" }),
      "@tanstack/react-start",
    );

    expect(buildPlan(mjs, tanstackStartReactRecipe(mjs)).edits[0]?.path).toBe("rsbuild.config.mjs");
    expect(tanstackStartReactRecipe(unnamed).prepare).toEqual([
      { bin: "rsbuild", args: ["build"] },
    ]);
    expect(tanstackStartReactRecipe(besideVite).prepare).toEqual([
      { bin: "vite", args: ["build"] },
    ]);
  });

  it("builds Solid's routes in from /rsbuild too", () => {
    const root = projectWith({
      "package.json": manifest({
        "@rsbuild/core": "^2.1.13",
        "@rsbuild/plugin-solid": "^2.0.0",
        "@tanstack/solid-router": "^1.170.43",
        "@tanstack/solid-start": "^1.169.4",
        "solid-js": "^1.9.17",
      }),
      "tsconfig.json": "{}",
      "rsbuild.config.ts": SOLID_RSBUILD,
    });
    const ctx = contextOf(root, "@tanstack/solid-start");
    const plan = buildPlan(ctx, tanstackStartSolidRecipe(ctx));

    expect(plan.edits[0]?.after).toContain(
      "plugins: [pluginSolid(), tanstackStart(), courierRoutes()],",
    );
    expect(plan.prepare).toEqual([{ bin: "rsbuild", args: ["build"] }]);
  });
});

describe("a new TanStack Start project", () => {
  it("is made by TanStack's own CLI, a minimal one, without its install", () => {
    expect(generatorFor("tanstack-start-react", "shop", "pnpm")).toEqual({
      args: [
        "@tanstack/cli@0.72",
        "create",
        "shop",
        "--framework",
        "React",
        "--package-manager",
        "pnpm",
        "--blank",
        "--no-install",
        "--yes",
      ],
      install: true,
    });
    expect(generatorFor("tanstack-start-solid", "shop", "npm")?.args).toContain("Solid");
  });
});
