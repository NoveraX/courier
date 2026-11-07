/**
 * A page alone loads an import's files where the package they go in is
 * built with React or Vue that Vite builds, beside no server framework: a
 * single-page app, with no server of its own. Its barrel's direct caller
 * is then a page's, from `@noverax/courier/client`, so the page's bundle
 * holds none of the server's part; anywhere else the barrel is the
 * server's, and its caller comes from `@noverax/courier/server` — as
 * Studio shows the files and as it writes them.
 */
import { FRAMEWORK_MARKERS } from "@noverax/courier-build/config";
import { projectRootAt } from "@noverax/courier-cli/devkit";
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { resolveImportLayout } from "../../src/apis/layout";
import { parseSpec } from "../../src/apis/parser";
import { generatedForPageAlone, withPageAlone } from "../../src/server/generated-for-pages";
import { planRegeneration } from "../../src/server/regenerate-import";
import { removeProjects, writeProject } from "../helpers/generated-project";

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Pets", version: "1" },
    servers: [{ url: "https://pets.test" }],
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          tags: ["pets"],
          responses: { "200": { description: "ok" } },
        },
      },
    },
  }),
);

type Listed = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

const SPA: Listed = { dependencies: { react: "^19.0.0" }, devDependencies: { vite: "^8.0.0" } };
const NEXT: Listed = { dependencies: { next: "^16.0.0", react: "^19.0.0" } };
const LAYOUT = resolveImportLayout({ outputDir: "src/api" }, "pets");
const OPTIONS = {
  type: "openapi",
  outputDir: "src/api",
  sourceName: "pets",
  generateClient: "direct",
} as const;

/* A project whose package.json lists the given packages, with nothing generated in it yet. */
function project(label: string, listed: Listed, more: Record<string, string> = {}): string {
  return writeProject(`page-alone/${label}`, [], {
    "package.json": JSON.stringify({ name: label, ...listed }),
    ...more,
  });
}

afterAll(() => {
  removeProjects("page-alone");
});

describe("a package a page alone loads", () => {
  it.each([
    ["spa-react", "React that Vite builds", SPA],
    [
      "spa-vue",
      "Vue that Vite builds",
      { dependencies: { vue: "^3.5.0" }, devDependencies: { vite: "^8.0.0" } },
    ],
    [
      "spa-mock",
      "React that Vite builds, Hono among its dev dependencies alone, as Studio's mock installs it",
      { dependencies: { react: "^19.0.0" }, devDependencies: { vite: "^8.0.0", hono: "^4.0.0" } },
    ],
  ])("is one of %s: %s", (label, _case, listed) => {
    expect(generatedForPageAlone(project(label, listed), LAYOUT)).toBe(true);
  });

  it.each([
    ["next", "Next.js", NEXT],
    ["nuxt", "Nuxt", { dependencies: { nuxt: "^4.0.0", vue: "^3.5.0" } }],
    [
      "express",
      "React that Vite builds beside Express",
      {
        dependencies: { express: "^5.0.0", react: "^19.0.0" },
        devDependencies: { vite: "^8.0.0" },
      },
    ],
    [
      "worker",
      "a Hono worker beside the React page Vite builds",
      { dependencies: { hono: "^4.0.0", react: "^19.0.0" }, devDependencies: { vite: "^8.0.0" } },
    ],
  ])("is none of %s: %s", (label, _case, listed) => {
    expect(generatedForPageAlone(project(label, listed), LAYOUT)).toBe(false);
  });

  /* Each server alone the shared list names: neither a page nor a framework that builds one. */
  const PAGES = new Set(["react", "vue", "next", "nuxt", "sveltekit", "astro"]);
  for (const id of ["react-router", "remix", "solid-start", "expo"]) PAGES.add(id);
  const SERVERS = FRAMEWORK_MARKERS.filter(({ id }) => !PAGES.has(id)).map(
    ({ id, label, marker }) => [label, id, marker] as const,
  );

  it("knows the servers the shared list names, Express among them", () => {
    expect(SERVERS.map(([, id]) => id)).toContain("express");
  });

  it.each(SERVERS)(
    "is one with %s among its dev dependencies alone, as a mock's server is",
    (_label, id, marker) => {
      const listed = {
        dependencies: { react: "^19.0.0" },
        devDependencies: { vite: "^8.0.0", [marker]: "^1.0.0" },
      };
      expect(generatedForPageAlone(project(`dev-${id}`, listed), LAYOUT)).toBe(true);
    },
  );

  it.each(SERVERS)("is none with %s among the dependencies it runs with", (_label, id, marker) => {
    const listed = {
      dependencies: { react: "^19.0.0", [marker]: "^1.0.0" },
      devDependencies: { vite: "^8.0.0" },
    };
    expect(generatedForPageAlone(project(`run-${id}`, listed), LAYOUT)).toBe(false);
  });

  it("is told by the package the files go in, in a workspace", () => {
    const root = project("workspace", NEXT, {
      "apps/spa/package.json": JSON.stringify({ name: "spa", ...SPA }),
    });
    const inSpa = resolveImportLayout({ outputDir: "apps/spa/src/api" }, "pets");

    expect(generatedForPageAlone(root, inSpa)).toBe(true);
    expect(generatedForPageAlone(root, LAYOUT)).toBe(false);
  });
});

describe("the barrel Studio writes", () => {
  it.each([
    ["shown-spa", "a single-page app", SPA, "@noverax/courier/client"],
    ["shown-next", "an app with a server", NEXT, "@noverax/courier/server"],
  ])("takes its direct caller, as Studio shows it, in %s: %s", (label, _case, listed, entry) => {
    const options = withPageAlone(OPTIONS, project(label, listed));
    const index = generateCode(SPEC, options).find((file) => file.path === LAYOUT.indexFile);

    expect(index?.content).toContain(`import { createCaller } from "${entry}";`);
  });

  it.each([
    ["written-spa", "a single-page app", SPA, "@noverax/courier/client"],
    ["written-next", "an app with a server", NEXT, "@noverax/courier/server"],
  ])(
    "takes its direct caller, as Studio writes it, in %s: %s",
    async (label, _case, listed, entry) => {
      const root = projectRootAt(project(label, listed));
      const { plan } = await planRegeneration({
        root,
        name: "pets",
        layout: LAYOUT,
        spec: SPEC,
        specHash: "made-up-hash",
        options: OPTIONS,
        entry: undefined,
      });
      const index = plan.writes.find((write) => write.path === LAYOUT.indexFile);

      expect(index?.body).toContain(`import { createCaller } from "${entry}";`);
    },
  );
});
