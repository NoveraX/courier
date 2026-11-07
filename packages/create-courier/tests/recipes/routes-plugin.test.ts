import { afterAll, describe, expect, it } from "vitest";

import { readProject } from "../../src/project/read-project";
import {
  astroRoutesEdit,
  nuxtRoutesEdit,
  rsbuildRoutesEdit,
  viteRoutesEdit,
} from "../../src/recipes/edits/routes-plugin";
import { rsbuildStudioStep, viteStudioEdit } from "../../src/recipes/edits/studio-browser";
import { manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

function projectOf(files: Record<string, string>) {
  return readProject(projectWith({ "package.json": manifest({}), ...files }));
}

describe("viteRoutesEdit", () => {
  const VITE =
    "import { sveltekit } from '@sveltejs/kit/vite';\nimport { defineConfig } from 'vite';\n\nexport default defineConfig({\n\tplugins: [sveltekit()]\n});\n";

  it("adds the framework's courierRoutes() to Vite's plugins, imported in the file's style", () => {
    const project = projectOf({ "vite.config.ts": VITE });
    const edit = viteRoutesEdit(project, "@noverax/courier-sveltekit/plugin");

    expect(edit.path).toBe("vite.config.ts");
    expect(edit.change(VITE)).toBe(
      "import { sveltekit } from '@sveltejs/kit/vite';\nimport { defineConfig } from 'vite';\nimport { courierRoutes } from '@noverax/courier-sveltekit/plugin';\n\nexport default defineConfig({\n\tplugins: [sveltekit(), courierRoutes()]\n});\n",
    );
  });

  it("counts the plugin a config calls from the engine's own entry as there already", () => {
    const text =
      'import { courierRoutes } from "@noverax/courier-build/vite";\n\nexport default defineConfig({ plugins: [courierRoutes()] });\n';
    const edit = viteRoutesEdit(
      projectOf({ "vite.config.ts": text }),
      "@noverax/courier-remix/plugin",
    );

    expect(edit.change(text)).toBe(text);
  });

  it("names the plugin's lines where the config is not one the edit knows", () => {
    const text = "export default async () => ({ plugins: [] });\n";
    const edit = viteRoutesEdit(
      projectOf({ "vite.config.js": text }),
      "@noverax/courier-solid/plugin",
    );

    expect(edit.path).toBe("vite.config.js");
    expect(edit.change(text)).toBeUndefined();
    expect(edit.manual).toEqual({
      file: "vite.config.js",
      what: "Build the pages' routes in: add courierRoutes() to the config's plugins",
      lines: [
        'import { courierRoutes } from "@noverax/courier-solid/plugin";',
        "plugins: [courierRoutes()],",
      ],
    });
  });
});

describe("astroRoutesEdit", () => {
  it("adds Courier's integration to Astro's integrations", () => {
    const text =
      "import { defineConfig } from 'astro/config';\n\nexport default defineConfig({});\n";
    const edit = astroRoutesEdit(projectOf({ "astro.config.mjs": text }));

    expect(edit.change(text)).toBe(
      "import { defineConfig } from 'astro/config';\nimport { courierRoutesIntegration } from '@noverax/courier-astro/plugin';\n\nexport default defineConfig({\n  integrations: [courierRoutesIntegration()],\n});\n",
    );
  });
});

describe("nuxtRoutesEdit", () => {
  it("adds Courier's module to Nuxt's modules, by its name", () => {
    const text = "export default defineNuxtConfig({\n  modules: ['@nuxt/eslint'],\n})\n";
    const edit = nuxtRoutesEdit(projectOf({ "nuxt.config.ts": text }));

    expect(edit.change(text)).toBe(
      "import { courierRoutesModule } from '@noverax/courier-nuxt/plugin'\n\nexport default defineNuxtConfig({\n  modules: ['@nuxt/eslint', courierRoutesModule],\n})\n",
    );
  });
});

describe("the config Vite or Rsbuild reads", () => {
  const VITE = ["js", "mjs", "ts", "cjs", "mts", "cts"].map((each) => `vite.config.${each}`);
  const RSBUILD = ["ts", "js", "mts", "mjs", "cts", "cjs"].map((each) => `rsbuild.config.${each}`);
  const COMMONJS =
    'const { defineConfig } = require("vite");\n\nmodule.exports = defineConfig({ plugins: [] });\n';
  const ESM = "export default { plugins: [] };\n";
  const page = "https://courier.example/docs/rsbuild";

  it("edits, or names in its step, the config of every name the tool reads", () => {
    for (const name of VITE) {
      const project = projectOf({
        [name]: name.endsWith("js") && name.includes(".c") ? COMMONJS : ESM,
      });
      const routes = viteRoutesEdit(project, "@noverax/courier-solid/plugin");

      expect([routes.path, routes.manual?.file, viteStudioEdit(project, "react").path]).toEqual([
        name,
        name,
        name,
      ]);
    }
    for (const name of RSBUILD) {
      const project = projectOf({ [name]: ESM });
      const routes = rsbuildRoutesEdit(project, "@noverax/courier-tanstack-start/rsbuild");

      expect([routes.path, routes.manual?.file, rsbuildStudioStep(project, page).file]).toEqual([
        name,
        name,
        name,
      ]);
    }
  });

  it("names a config written with module.exports in a step, as no edit writes into one", () => {
    const edit = viteRoutesEdit(
      projectOf({ "vite.config.cjs": COMMONJS }),
      "@noverax/courier-solid/plugin",
    );

    expect(edit.change(COMMONJS)).toBeUndefined();
    expect(edit.manual?.file).toBe("vite.config.cjs");
  });

  it("takes the config the tool reads first where a project has two, and Vite's in TypeScript where it has none", () => {
    const vite = projectOf({ "vite.config.ts": ESM, "vite.config.js": ESM });
    const rsbuild = projectOf({ "rsbuild.config.js": ESM, "rsbuild.config.ts": ESM });

    expect(viteRoutesEdit(vite, "@noverax/courier-solid/plugin").path).toBe("vite.config.js");
    expect(rsbuildStudioStep(rsbuild, page).file).toBe("rsbuild.config.ts");
    expect(viteStudioEdit(projectOf({}), "react").path).toBe("vite.config.ts");
    expect(rsbuildStudioStep(projectOf({}), page).file).toBe("rsbuild.config.ts");
  });
});
