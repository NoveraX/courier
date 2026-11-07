/**
 * @vitest-environment node
 *
 * The framework a project is built with, told by the packages its
 * package.json lists, by the same rule Courier sets a project up by.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  detectFramework,
  type ListedPackages,
  projectFramework,
} from "../../src/config/frameworks";

function listed(fields: Partial<ListedPackages>): ListedPackages {
  return {
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
    optionalDependencies: {},
    ...fields,
  };
}

describe("detectFramework", () => {
  it.each([
    ["Next.js", { dependencies: { next: "16", react: "19" } }],
    ["Nuxt", { dependencies: { nuxt: "4", vue: "3" } }],
    ["SvelteKit", { devDependencies: { "@sveltejs/kit": "2", vite: "7" } }],
    ["Astro", { dependencies: { astro: "5", react: "19" } }],
    ["React with Vite", { devDependencies: { vite: "7" }, dependencies: { react: "19" } }],
    ["Vue with Vite", { devDependencies: { vite: "7" }, dependencies: { vue: "3" } }],
    ["Express", { peerDependencies: { express: "5" } }],
  ])("tells %s", (label, fields) => {
    expect(detectFramework(listed(fields))?.label).toBe(label);
  });

  it("tells the framework an app runs with before the one Studio's mock brings as a dev dependency", () => {
    expect(
      detectFramework(listed({ dependencies: { express: "5" }, devDependencies: { hono: "4" } }))
        ?.label,
    ).toBe("Express");
    expect(detectFramework(listed({ devDependencies: { hono: "4" } }))?.label).toBe("Hono");
  });

  it("tells a server a page built with Vite runs beside before the page, as it tells Express", () => {
    const servers: Array<[string, string]> = [
      ["Koa", "koa"],
      ["hapi", "@hapi/hapi"],
      ["Elysia", "elysia"],
      ["h3", "h3"],
      ["Nitro", "nitro"],
    ];
    for (const [label, server] of servers)
      expect(
        detectFramework(
          listed({ dependencies: { [server]: "1", react: "19" }, devDependencies: { vite: "7" } }),
        )?.label,
      ).toBe(label);
    expect(detectFramework(listed({ dependencies: { nuxt: "4", h3: "1" } }))?.label).toBe("Nuxt");
  });

  it("tells none where the project lists no framework it knows", () => {
    expect(detectFramework(listed({ dependencies: { vite: "7" } }))).toBeUndefined();
  });
});

describe("projectFramework", () => {
  let dir: string;

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-project-framework-")));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads the package.json nearest the folder, above it where the folder has none", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { astro: "5" } }));
    mkdirSync(join(dir, "src/lib"), { recursive: true });

    const found = projectFramework(join(dir, "src/lib"));

    expect(found).toMatchObject({ manifest: join(dir, "package.json") });
    expect(found.framework?.id).toBe("astro");
  });

  it("reads a package.json that is not JSON as one that lists nothing", () => {
    writeFileSync(join(dir, "package.json"), "{ not json");

    expect(projectFramework(dir)).toEqual({
      framework: undefined,
      manifest: join(dir, "package.json"),
    });
  });
});
