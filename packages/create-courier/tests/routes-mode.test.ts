import { afterAll, describe, expect, it } from "vitest";

import { frameworkById } from "../src/frameworks";
import { readProject } from "../src/project/read-project";
import { routesAsked, routesModeOf } from "../src/routes-mode";
import { manifest, projectWith, removeProjects } from "./recipes/project-fixture";

afterAll(removeProjects);

function nextApp(extra: Record<string, string> = {}, scripts: Record<string, string> = {}) {
  return readProject(
    projectWith({
      "package.json": manifest({ next: "16.4.0", react: "19.2.0" }, { scripts }),
      "tsconfig.json": "{}",
      ...extra,
    }),
  );
}

describe("routesAsked", () => {
  it("takes plugin, file, or nothing", () => {
    expect(routesAsked("plugin")).toBe("plugin");
    expect(routesAsked("file")).toBe("file");
    expect(routesAsked(undefined)).toBeUndefined();
  });

  it("refuses any other value, naming the two it takes", () => {
    expect(() => routesAsked("vite")).toThrow('--routes takes plugin or file, not "vite"');
  });
});

describe("routesModeOf", () => {
  const next = frameworkById("next");

  it("takes the routes from the plugin in a project without courier.routes.ts", () => {
    expect(routesModeOf(nextApp(), next, undefined)).toBe("plugin");
  });

  it("keeps the file in a project that has one, or whose scripts write it", () => {
    expect(routesModeOf(nextApp({ "courier.routes.ts": "export {};\n" }), next, undefined)).toBe(
      "file",
    );
    expect(routesModeOf(nextApp({}, { routes: "courier-cli routes" }), next, undefined)).toBe(
      "file",
    );
  });

  it("keeps the file where studio.routes puts it, as the mark Courier writes at its top tells", () => {
    const module =
      "// Written by Courier from courier.config.ts. Do not edit it:\nexport const shopRoutes = {};\n";

    expect(routesModeOf(nextApp({ "src/lib/shop-routes.ts": module }), next, undefined)).toBe(
      "file",
    );
  });

  it("does as --routes asks, whatever the project keeps", () => {
    expect(routesModeOf(nextApp(), next, "file")).toBe("file");
    expect(routesModeOf(nextApp({ "courier.routes.ts": "export {};\n" }), next, "plugin")).toBe(
      "plugin",
    );
  });

  it("takes the file for a framework Courier has no plugin for", () => {
    expect(routesModeOf(nextApp(), frameworkById("express"), undefined)).toBe("file");
    expect(routesModeOf(nextApp(), frameworkById("express"), "file")).toBe("file");
  });

  it("refuses --routes plugin for a framework Courier has no plugin for, naming those it has one for", () => {
    expect(() => routesModeOf(nextApp(), frameworkById("express"), "plugin")).toThrow(
      "--routes plugin: Courier builds the routes in with a plugin for Next.js, Nuxt, SvelteKit, Astro, React Router, Remix, SolidStart, TanStack Start for React, TanStack Start for Solid, not for Express",
    );
  });
});
