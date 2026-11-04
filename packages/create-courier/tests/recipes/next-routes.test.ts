import { afterAll, describe, expect, it } from "vitest";

import { readProject } from "../../src/project/read-project";
import { nextRoutesEdit } from "../../src/recipes/edits/next-routes";
import { manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

/* The edit for a project whose config is this file, and what it makes of it. */
function edited(file: string, text: string): { path: string; after: string | undefined } {
  const root = projectWith({
    "package.json": manifest({ next: "16.4.0" }),
    "tsconfig.json": "{}",
    [file]: text,
  });
  const edit = nextRoutesEdit(readProject(root));
  return { path: edit.path, after: edit.change(text) };
}

describe("nextRoutesEdit", () => {
  it("passes the config create-next-app writes to withCourier(), imported below its imports", () => {
    const text =
      'import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {\n  /* config options here */\n};\n\nexport default nextConfig;\n';

    expect(edited("next.config.ts", text)).toEqual({
      path: "next.config.ts",
      after:
        'import type { NextConfig } from "next";\nimport { withCourier } from "@noverax/courier-next/plugin";\n\nconst nextConfig: NextConfig = {\n  /* config options here */\n};\n\nexport default withCourier(nextConfig);\n',
    });
  });

  it("wraps an object written in the export, in the file's quotes and without its semicolons", () => {
    const text = "export default {\n  basePath: '/shop',\n}\n";

    expect(edited("next.config.mjs", text).after).toBe(
      "import { withCourier } from '@noverax/courier-next/plugin'\n\nexport default withCourier({\n  basePath: '/shop',\n})\n",
    );
  });

  it("requires the plugin in a CommonJS config", () => {
    const text =
      "/** @type {import('next').NextConfig} */\nconst nextConfig = {};\n\nmodule.exports = nextConfig;\n";

    expect(edited("next.config.js", text).after).toBe(
      "const { withCourier } = require('@noverax/courier-next/plugin');\n\n/** @type {import('next').NextConfig} */\nconst nextConfig = {};\n\nmodule.exports = withCourier(nextConfig);\n",
    );
  });

  it("wraps a config another wrapper returns", () => {
    const text =
      'import { withCourierStudio } from "@noverax/courier-studio/next";\n\nconst nextConfig = {};\n\nexport default withCourierStudio()(nextConfig);\n';

    expect(edited("next.config.mjs", text).after).toContain(
      "export default withCourier(withCourierStudio()(nextConfig));",
    );
  });

  it("leaves a config that passes its object to withCourier() as it is", () => {
    const text =
      'import { withCourier } from "@noverax/courier-next/plugin";\n\nexport default withCourier({});\n';

    expect(edited("next.config.mjs", text).after).toBe(text);
  });

  it("leaves a config written as a function to the person, whose object is the one to pass", () => {
    const text =
      "const nextConfig = {};\n\nexport default async function config(phase) {\n  return nextConfig;\n}\n";
    const arrow = "const nextConfig = {};\n\nexport default (phase) => nextConfig;\n";

    expect(edited("next.config.mjs", text).after).toBeUndefined();
    expect(edited("next.config.mjs", arrow).after).toBeUndefined();
  });

  it("leaves an export that goes on past its name to the person", () => {
    const text = "const nextConfig = {};\n\nexport default nextConfig satisfies NextConfig;\n";

    expect(edited("next.config.ts", text).after).toBeUndefined();
  });

  it("names the lines a CommonJS config takes, where the person adds them", () => {
    const root = projectWith({
      "package.json": manifest({ next: "16.4.0" }),
      "tsconfig.json": "{}",
      "next.config.js": "module.exports = async () => ({});\n",
    });

    expect(nextRoutesEdit(readProject(root)).manual.lines).toEqual([
      'const { withCourier } = require("@noverax/courier-next/plugin");',
      "module.exports = withCourier(nextConfig);",
    ]);
  });
});
