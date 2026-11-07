import { afterAll, describe, expect, it } from "vitest";

import { migrateCode } from "../../../src/upgrade/codemod/run-migrations";
import { projectCode } from "../../../src/upgrade/codemod/source-files";
import { projectSides } from "../../../src/upgrade/entries/piece-sides";
import { UPGRADE_LIMITS } from "../../../src/upgrade/limits";
import { ENTRY_IMPORTS } from "../../../src/upgrade/migrations/entry-imports";
import { RELEASES } from "../../../src/upgrade/releases";
import { workspaceOf } from "../../../src/upgrade/workspace";
import { manifest, projectWith, removeProjects } from "../../helpers/temp-project";

afterAll(removeProjects);

function upgraded(files: Readonly<Record<string, string>>, migrations = [ENTRY_IMPORTS]) {
  const root = projectWith(files);
  const code = projectCode(root);
  const migrated = migrateCode(code, migrations, projectSides(workspaceOf(root), code));
  return {
    after: (path: string) => migrated.edits.find((edit) => edit.path === path)?.after,
    steps: (path: string) => migrated.manual.filter((step) => step.file === path),
    edited: migrated.edits.map((edit) => edit.path).sort(),
  };
}

const NEXT = {
  "package.json": manifest({ name: "web", dependencies: { next: "16.0.0" } }),
  "tsconfig.json": '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
  "instrumentation.ts":
    'import { registerSources } from "@noverax/courier";\nimport config from "./courier.config";\n',
  "src/app/page.tsx":
    'import { caller } from "@/lib/server-only";\nimport { Panel } from "@/components/Panel";\nexport default function Page() {}\n',
  "src/app/api/users/route.ts":
    'import { createHandler } from "@noverax/courier";\nimport { shared } from "@/lib/shared";\nimport { columns } from "@/lib/types";\nimport type { Only } from "@/lib/only-types";\nexport const GET = createHandler({});\n',
  "src/components/Panel.tsx":
    '"use client";\nimport { createCaller, isHTTPError, type CallOptions } from \'@noverax/courier\';\nimport { shared } from "@/lib/shared";\nimport { defineApi } from "@noverax/courier/define";\nimport { columns } from "@/lib/types";\nexport function Panel() {}\n',
  "src/components/Bad.tsx":
    '"use client";\nimport { createHandler, isHTTPError } from "@noverax/courier";\n',
  "src/app/bad/page.tsx":
    'import { Bad } from "@/components/Bad";\nexport default function BadPage() {}\n',
  "src/lib/shared.ts":
    'import { createCaller, isHTTPError } from "@noverax/courier";\nimport type { CallOptions } from "@noverax/courier";\nexport const shared = 1;\n',
  "src/lib/types.ts":
    'import type { CallOptions } from "@noverax/courier";\nexport const columns: CallOptions[] = [];\n',
  "src/lib/only-types.ts":
    'import type { CallOptions } from "@noverax/courier";\nexport type Only = CallOptions;\n',
  "src/lib/server-only.ts": 'export { createCaller } from "@noverax/courier";\n',
  "scripts/seed.ts": 'import { createCaller } from "@noverax/courier";\n',
};

const START_PACKAGE = manifest({
  dependencies: {
    "@tanstack/react-start": "1.169.4",
    "@tanstack/react-router": "1.170.46",
    react: "19.0.0",
    "react-dom": "19.0.0",
  },
  devDependencies: { vite: "8.0.0" },
});

describe("0.5.0: a page's imports and a server's", () => {
  it("takes a page's from @noverax/courier/client and a server's from /server, in the quotes they were written in", () => {
    const { after } = upgraded(NEXT);

    expect(after("src/components/Panel.tsx")).toBe(
      NEXT["src/components/Panel.tsx"].replace("'@noverax/courier'", "'@noverax/courier/client'"),
    );
    expect(after("src/app/api/users/route.ts")).toBe(
      NEXT["src/app/api/users/route.ts"].replace('"@noverax/courier"', '"@noverax/courier/server"'),
    );
    expect(after("instrumentation.ts")).toContain(
      'import { registerSources } from "@noverax/courier/server";',
    );
    expect(after("src/lib/server-only.ts")).toBe(
      'export { createCaller } from "@noverax/courier/server";\n',
    );
    expect(after("src/lib/types.ts")).toContain(
      'import type { CallOptions } from "@noverax/courier/client";',
    );
  });

  it("keeps createCaller in the root where the server loads the file too, and says why", () => {
    const { after, steps } = upgraded(NEXT);

    expect(after("src/lib/shared.ts")).toBe(
      'import { createCaller, isHTTPError } from "@noverax/courier";\nimport type { CallOptions } from "@noverax/courier/client";\nexport const shared = 1;\n',
    );
    expect(steps("src/lib/shared.ts")).toEqual([
      {
        file: "src/lib/shared.ts",
        what: expect.stringMatching(
          /^line 1: the server loads this file too, as src\/app\/api\/users\/route\.ts leads to it, where createCaller from @noverax\/courier is the server's caller, so the import stays there/,
        ),
        lines: [
          'import { createCaller } from "@noverax/courier/client"; // in the page\'s module',
          'import { createCaller } from "@noverax/courier/server"; // in the server\'s module',
        ],
      },
    ]);
  });

  it("names what the server may load a file through where Courier did not read it", () => {
    const { steps } = upgraded({
      "package.json": manifest({ dependencies: { next: "16.0.0" } }),
      "app/api/route.ts": 'import { schema } from "../../lib/schema";\nexport function GET() {}\n',
      "lib/schema.ts": `export const schema = 1;\n// ${"x".repeat(UPGRADE_LIMITS.sourceBytes)}\n`,
      "app/panel.tsx": `"use client";\nimport { caller } from "../lib/api";\n`,
      "lib/api.ts": 'import { createCaller } from "@noverax/courier";\n',
    });

    expect(steps("lib/api.ts")[0]?.what).toMatch(
      /^line 1: Courier did not read lib\/schema\.ts, which the server may load, so the server may load this file too, where createCaller/,
    );
  });

  it("says the server may load a file where only an import that may lead to it does", () => {
    const { steps } = upgraded({
      "package.json": manifest({
        name: "acme",
        private: true,
        workspaces: ["apps/*", "packages/*"],
      }),
      "apps/web/package.json": manifest({ name: "web", dependencies: { next: "16.0.0" } }),
      "apps/web/app/page.tsx":
        'import { api } from "@acme/api";\nexport default function Page() {}\n',
      "apps/web/app/panel.tsx": '"use client";\nimport { api } from "@acme/api";\n',
      "packages/api/package.json": manifest({
        name: "@acme/api",
        exports: { browser: "./src/browser.ts", node: "./src/node.ts", default: "./src/node.ts" },
      }),
      "packages/api/src/browser.ts": 'import { createCaller } from "@noverax/courier";\n',
      "packages/api/src/node.ts": "export const api = 1;\n",
    });

    expect(steps("packages/api/src/browser.ts")[0]?.what).toMatch(
      /^line 1: the server may load this file too, as apps\/web\/app\/page\.tsx leads to it, where createCaller/,
    );
  });

  it("keeps a page's import of the server's names in the root, and names them", () => {
    const { after, steps } = upgraded(NEXT);

    expect(after("src/components/Bad.tsx")).toBeUndefined();
    expect(steps("src/components/Bad.tsx")).toEqual([
      {
        file: "src/components/Bad.tsx",
        what: expect.stringMatching(
          /^line 2: a page loads this file, and createHandler is the server's/,
        ),
        lines: [
          'import { isHTTPError } from "@noverax/courier/client";',
          'import { createHandler } from "@noverax/courier/server"; // in a module only the server loads',
        ],
      },
    ]);
  });

  it("keeps a page's import of a name it takes from the root alone, as redact, and says why, and takes a server's to /server", () => {
    const { after, steps } = upgraded({
      "package.json": manifest({ dependencies: { next: "16.0.0" } }),
      "src/components/Mask.tsx":
        '"use client";\nimport { redact } from "@noverax/courier";\nexport const masked = redact("x");\n',
      "src/components/Both.tsx":
        '"use client";\nimport { isHTTPError, redact } from "@noverax/courier";\nexport const both = [isHTTPError, redact];\n',
      "src/app/api/log/route.ts":
        'import { redact } from "@noverax/courier";\nexport function GET() {\n  return new Response(String(redact("x")));\n}\n',
    });
    const why =
      "line 2: @noverax/courier/client leaves redact out, so a page takes it from @noverax/courier: the import stays there";

    expect(after("src/components/Mask.tsx")).toBeUndefined();
    expect(steps("src/components/Mask.tsx")).toEqual([
      { file: "src/components/Mask.tsx", what: why, lines: [] },
    ]);
    expect(after("src/components/Both.tsx")).toBeUndefined();
    expect(steps("src/components/Both.tsx")).toEqual([
      {
        file: "src/components/Both.tsx",
        what: why,
        lines: [
          'import { isHTTPError } from "@noverax/courier/client";',
          'import { redact } from "@noverax/courier"; // a page takes it from the root',
        ],
      },
    ]);
    expect(after("src/app/api/log/route.ts")).toContain(
      'import { redact } from "@noverax/courier/server";',
    );
    expect(steps("src/app/api/log/route.ts")).toEqual([]);
  });

  it("leaves a file neither side loads as written, and says why and what to write", () => {
    const { after, steps } = upgraded(NEXT);

    expect(after("scripts/seed.ts")).toBeUndefined();
    expect(steps("scripts/seed.ts")).toEqual([
      {
        file: "scripts/seed.ts",
        what: expect.stringMatching(
          /^line 1: neither the framework's rules nor the imports Courier reads have a page or the server load this file, so its import stays in @noverax\/courier/,
        ),
        lines: [
          'import { createCaller } from "@noverax/courier/client"; // where a page loads it',
          'import { createCaller } from "@noverax/courier/server"; // where only the server does',
        ],
      },
    ]);
  });

  it("moves an import of types alone, which nothing loads, to the entry that gives them, and says nothing", () => {
    const panel = `"use client";\nimport type { IncomingRequest } from "@noverax/courier";\nimport { type CallOptions, type IncomingRequest as Request } from "@noverax/courier";\nimport { CallOptions as Options } from "@noverax/courier";\nexport function Panel() {}\n`;
    const { after, steps } = upgraded({ ...NEXT, "src/components/Panel.tsx": panel });

    expect(after("src/components/Panel.tsx")).toBe(
      panel
        .replace(
          'IncomingRequest } from "@noverax/courier";',
          'IncomingRequest } from "@noverax/courier/server";',
        )
        .replace(
          'as Request } from "@noverax/courier"',
          'as Request } from "@noverax/courier/server"',
        )
        .replace(
          'as Options } from "@noverax/courier"',
          'as Options } from "@noverax/courier/client"',
        ),
    );
    expect(steps("src/components/Panel.tsx")).toEqual([]);
    expect(after("src/lib/only-types.ts")).toBe(
      NEXT["src/lib/only-types.ts"].replace('"@noverax/courier"', '"@noverax/courier/client"'),
    );
    expect(steps("src/lib/only-types.ts")).toEqual([]);
  });

  it("keeps a page's import of types named one by one in the root where its tsconfig keeps it as a load, and says why", () => {
    const panel =
      'import { type IncomingRequest } from "@noverax/courier";\nimport type { IncomingRequest as Request } from "@noverax/courier";\n';
    const { after, steps } = upgraded({
      "package.json": manifest({ dependencies: { vite: "7.0.0", react: "19.0.0" } }),
      "tsconfig.json": '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }',
      "tsconfig.app.json": '{ "compilerOptions": { "verbatimModuleSyntax": true } }',
      "src/panel.tsx": panel,
    });

    expect(after("src/panel.tsx")).toBe(
      panel.replace(
        'as Request } from "@noverax/courier"',
        'as Request } from "@noverax/courier/server"',
      ),
    );
    expect(steps("src/panel.tsx")).toEqual([
      {
        file: "src/panel.tsx",
        what: expect.stringMatching(
          /^line 1: a page loads this file, and IncomingRequest is the server's/,
        ),
        lines: [
          'import { type IncomingRequest } from "@noverax/courier/server"; // in a module only the server loads',
        ],
      },
    ]);
  });

  it("moves an import() and a require() of the root whose names are in sight, and names one a page takes whole", () => {
    const panel = `"use client";\nexport async function load() {\n  const { isHTTPError } = await import("@noverax/courier");\n  const core = await import('@noverax/courier');\n  core.isHTTPError(error);\n  import("@noverax/courier").then(({ createProxyCaller }) => createProxyCaller);\n  const { createFetch } = require("@noverax/courier");\n  const whole = await import("@noverax/courier");\n  register(whole);\n}\n`;
    const route = `export async function GET() {\n  const { createHandler } = await import("@noverax/courier");\n}\n`;
    const { after, steps } = upgraded({
      "package.json": manifest({ dependencies: { next: "16.0.0" } }),
      "app/panel.tsx": panel,
      "app/api/route.ts": route,
    });

    expect(after("app/panel.tsx")).toBe(
      panel
        .replace(
          'isHTTPError } = await import("@noverax/courier")',
          'isHTTPError } = await import("@noverax/courier/client")',
        )
        .replace("import('@noverax/courier')", "import('@noverax/courier/client')")
        .replace('import("@noverax/courier").then', 'import("@noverax/courier/client").then')
        .replace('require("@noverax/courier")', 'require("@noverax/courier/client")'),
    );
    expect(steps("app/panel.tsx").map((step) => step.what)).toEqual([
      expect.stringMatching(
        /^line 8: a page loads this file, and its import\(\) of @noverax\/courier takes the root whole/,
      ),
    ]);
    expect(after("app/api/route.ts")).toBe(
      route.replace('import("@noverax/courier")', 'import("@noverax/courier/server")'),
    );
  });

  it("changes nothing the second time, nor a subpath's import", () => {
    const first = upgraded(NEXT);
    const again: Record<string, string> = { ...NEXT };
    for (const path of first.edited) again[path] = first.after(path) ?? "";

    expect(first.after("src/components/Panel.tsx")).toContain('from "@noverax/courier/define"');
    expect(upgraded(again).edited).toEqual([]);
  });

  it("takes a module of server functions a client component imports to /server, with nothing to say", () => {
    const { after, steps } = upgraded({
      "package.json": manifest({ dependencies: { next: "16.0.0" } }),
      "app/form.tsx": `"use client";\nimport { save } from "./actions";\nimport { token } from "./token";\nexport function Form() {}\n`,
      "app/actions.ts": `"use server";\nimport { createCaller } from "@noverax/courier";\nexport async function save() {}\n`,
      "app/token.ts": `"use server";\nimport { ensureCsrfToken } from "@noverax/courier";\nexport async function token() {}\n`,
    });

    expect(after("app/actions.ts")).toContain(
      'import { createCaller } from "@noverax/courier/server";',
    );
    expect(after("app/token.ts")).toContain(
      'import { ensureCsrfToken } from "@noverax/courier/server";',
    );
    expect([...steps("app/actions.ts"), ...steps("app/token.ts")]).toEqual([]);
  });

  it("moves an Astro page's frontmatter to the server's entry and its scripts to the page's", () => {
    const page = `---\nimport { createCaller } from "@noverax/courier";\n---\n<p>Hi</p>\n<script>\nimport { createProxyCaller } from "@noverax/courier";\n</script>\n`;
    const { after } = upgraded({
      "package.json": manifest({ dependencies: { astro: "5.0.0" } }),
      "src/pages/index.astro": page,
    });

    expect(after("src/pages/index.astro")).toBe(
      page
        .replace(
          'createCaller } from "@noverax/courier"',
          'createCaller } from "@noverax/courier/server"',
        )
        .replace(
          'createProxyCaller } from "@noverax/courier"',
          'createProxyCaller } from "@noverax/courier/client"',
        ),
    );
  });

  it("keeps createCaller in the root in a component whose other names an Astro page's frontmatter runs", () => {
    const users = `import { createCaller } from "@noverax/courier";\nexport const caller = createCaller(shop);\nexport default function Users() {}\n`;
    const { after, steps } = upgraded({
      "package.json": manifest({ dependencies: { astro: "5.0.0" } }),
      "src/pages/index.astro": `---\nimport Users, { caller } from "../components/Users.tsx";\nconst users = await caller.users();\n---\n<Users client:load />\n`,
      "src/components/Users.tsx": users,
    });

    expect(after("src/components/Users.tsx")).toBeUndefined();
    expect(steps("src/components/Users.tsx")[0]?.what).toMatch(
      /^line 1: the server loads this file too, as src\/pages\/index\.astro leads to it, where createCaller from @noverax\/courier is the server's caller/,
    );
  });

  it("reads a namespace's names by what the file takes of it, and leaves one used whole", () => {
    const { after, steps } = upgraded({
      "package.json": manifest({ dependencies: { vite: "7.0.0", react: "19.0.0" } }),
      "src/named.ts":
        'import * as courier from "@noverax/courier";\nif (courier.isHTTPError(error)) {}\nlet options: courier.CallOptions;\n',
      "src/whole.ts": 'import * as courier from "@noverax/courier";\nregister(courier);\n',
      "src/barrel.ts": 'export * from "@noverax/courier";\n',
    });

    expect(after("src/named.ts")).toContain('import * as courier from "@noverax/courier/client";');
    expect(after("src/whole.ts")).toBeUndefined();
    expect(steps("src/whole.ts")[0]?.what).toMatch(
      /^line 1: a page loads this file, and it takes @noverax\/courier whole/,
    );
    expect(after("src/barrel.ts")).toBeUndefined();
    expect(steps("src/barrel.ts")[0]?.what).toMatch(
      /^line 1: a page loads this file, and it re-exports every name of @noverax\/courier/,
    );
  });

  it("reads a binding's members in the scope that declares it, past another binding of its name", () => {
    const files = {
      "package.json": manifest({ dependencies: { vite: "7.0.0", react: "19.0.0" } }),
      "src/load.ts":
        'export async function load() {\n  const courier = await import("@noverax/courier");\n  return courier.createCaller;\n}\nexport const keys = (courier: object) => Object.keys(courier);\n',
      "src/check.ts":
        'export async function check() {\n  const courier = await import("@noverax/courier");\n  const inner = () => {\n    const courier = { registerSources: 1 };\n    return courier.registerSources;\n  };\n  return courier.isHTTPError;\n}\nexport function other() {\n  const courier = { registerSources: 1 };\n  return courier.registerSources;\n}\n',
      "src/space.ts":
        'import * as courier from "@noverax/courier";\nexport const failed = courier.isHTTPError;\nexport const all = (courier: object) => Object.keys(courier);\nexport function hidden() {\n  var courier = { registerSources: 1 };\n  return courier.registerSources;\n}\n',
    };
    const { after, steps } = upgraded(files);

    expect(after("src/load.ts")).toBe(
      files["src/load.ts"].replace('"@noverax/courier"', '"@noverax/courier/client"'),
    );
    expect(after("src/check.ts")).toBe(
      files["src/check.ts"].replace('"@noverax/courier"', '"@noverax/courier/client"'),
    );
    expect(after("src/space.ts")).toBe(
      files["src/space.ts"].replace('"@noverax/courier"', '"@noverax/courier/client"'),
    );
    expect(["src/load.ts", "src/check.ts", "src/space.ts"].flatMap(steps)).toEqual([]);
  });

  it("counts the members a function's defaults, a switch's test and a static block's caller read, past a binding only the body or the cases see", () => {
    const TOP =
      'import * as courier from "@noverax/courier";\nexport const failed = courier.isHTTPError;\n';
    const files = {
      "package.json": manifest({ dependencies: { vite: "7.0.0", react: "19.0.0" } }),
      "src/defaults.ts": `${TOP}export function f(x = courier.registerSources) {\n  var courier = 1;\n  return [x, courier];\n}\n`,
      "src/arrow.ts": `${TOP}export const g = (x = courier.registerSources) => {\n  var courier = 0;\n  return [x, courier];\n};\n`,
      "src/switch.ts": `${TOP}export function h(k: number) {\n  switch (courier.registerSources ? k : 0) {\n    case 1:\n      const courier = 2;\n      return courier;\n  }\n}\n`,
      "src/static.ts": `${TOP}export function make() {\n  class Box {\n    static {\n      var courier = 1;\n    }\n  }\n  return [Box, courier.registerSources];\n}\n`,
    };
    const { after, steps } = upgraded(files);

    for (const file of ["src/defaults.ts", "src/arrow.ts", "src/switch.ts", "src/static.ts"]) {
      expect(after(file)).toBeUndefined();
      expect(steps(file)).toEqual([
        expect.objectContaining({ what: expect.stringMatching(/registerSources is the server's/) }),
      ]);
    }
  });

  it("moves a Vite page's imports beside a server, whatever its framework; none where its entry is not read; a server's with no Vite entry to /server", () => {
    const BESIDE = manifest({
      dependencies: { express: "5.0.0", preact: "10.27.0" },
      devDependencies: { vite: "7.0.0" },
    });
    const files = {
      "src/main.tsx": 'import { createCaller } from "@noverax/courier";\n',
      "server/index.ts": 'import { createHandler } from "@noverax/courier";\n',
    };
    const told = upgraded({
      "package.json": BESIDE,
      "index.html": '<script type="module" src="/src/main.tsx"></script>\n',
      ...files,
    });
    const untold = upgraded({
      "package.json": BESIDE,
      "vite.config.ts": 'import base from "./vite.base";\n\nexport default { ...base };\n',
      ...files,
    });
    const server = upgraded({
      "package.json": manifest({
        dependencies: { fastify: "5.0.0" },
        devDependencies: { vite: "7.0.0" },
      }),
      ...files,
    });

    expect(told.after("src/main.tsx")).toBe(
      'import { createCaller } from "@noverax/courier/client";\n',
    );
    expect(told.after("server/index.ts")).toBe(
      'import { createHandler } from "@noverax/courier/server";\n',
    );
    expect(untold.edited).toEqual([]);
    for (const file of Object.keys(files)) expect(untold.steps(file)).toHaveLength(1);
    expect(untold.steps("vite.config.ts")).toEqual([
      expect.objectContaining({ what: expect.stringMatching(/^Not read: its default export/) }),
    ]);
    expect(server.after("src/main.tsx")).toBe(
      'import { createCaller } from "@noverax/courier/server";\n',
    );
    expect(server.after("server/index.ts")).toBe(
      'import { createHandler } from "@noverax/courier/server";\n',
    );
  });

  it("takes create-vue's page beside a server to /client, past the new URL() its config aliases @ with", () => {
    const app = 'import { createCaller } from "@noverax/courier";\n';
    const { after, steps } = upgraded({
      "package.json": manifest({
        dependencies: { express: "5.0.0", vue: "3.5.0" },
        devDependencies: { vite: "7.0.0" },
      }),
      "tsconfig.json": '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
      "vite.config.ts":
        'import { fileURLToPath, URL } from "node:url";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({ resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } } });\n',
      "index.html": '<script type="module" src="/src/index.ts"></script>\n',
      "src/index.ts": 'import { app } from "@/app";\n',
      "src/app.ts": app,
      "server/index.ts": 'import { registerSources } from "@noverax/courier";\n',
    });

    expect(after("src/app.ts")).toBe(
      app.replace('"@noverax/courier"', '"@noverax/courier/client"'),
    );
    expect(steps("src/app.ts")).toEqual([]);
  });

  it("moves nothing of a page beside a server that a bundler other than Vite builds, and says so", () => {
    const files = {
      "src/main.tsx":
        'import { isHTTPError } from "@noverax/courier";\nimport { App } from "./App";\n',
      "src/App.tsx": 'import { createCaller } from "@noverax/courier";\n',
      "server/index.ts": 'import { registerSources } from "@noverax/courier";\n',
    };
    const { edited, steps } = upgraded({
      "package.json": manifest({
        dependencies: { express: "5.0.0", react: "19.0.0", "react-dom": "19.0.0" },
        devDependencies: { webpack: "5.100.0", vite: "7.0.0", vitest: "4.0.0" },
      }),
      "webpack.config.js": 'module.exports = { entry: "./src/main.tsx" };\n',
      ...files,
    });

    expect(edited).toEqual([]);
    for (const file of Object.keys(files)) expect(steps(file)).toHaveLength(1);
    expect(steps("package.json")).toEqual([
      expect.objectContaining({
        what: expect.stringMatching(/^Not read: it lists react, and Vite has no entry here: /),
      }),
    ]);
  });

  it("moves nothing of a package beside h3 or Nitro whose page's framework no list knows, and says so", () => {
    const { edited, steps } = upgraded({
      "package.json": manifest({
        dependencies: { "@angular/core": "20.3.0", "@analogjs/platform": "2.0.0", h3: "1.15.0" },
      }),
      "src/app/pages/index.page.ts": 'import { createCaller } from "@noverax/courier";\n',
      "src/server/routes/api/hello.ts": 'import { createHandler } from "@noverax/courier";\n',
    });

    expect(edited).toEqual([]);
    for (const file of ["src/app/pages/index.page.ts", "src/server/routes/api/hello.ts"])
      expect(steps(file)).toEqual([
        expect.objectContaining({ what: expect.stringContaining("Courier knows no framework") }),
      ]);
  });

  it("moves TanStack Start's imports by its build: a route's to /client, a server route's and a server function's to /server", () => {
    const files = {
      "src/routes/index.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { isHTTPError } from "@noverax/courier";\nimport { getUsers } from "../lib/users.functions";\nimport { caller } from "../lib/shared";\nexport const Route = createFileRoute("/")({ loader: () => getUsers(), component: () => [isHTTPError, caller] });\n',
      "src/routes/api/users.ts":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { createHandler } from "@noverax/courier";\nexport const Route = createFileRoute("/api/users")({ server: { handlers: { GET: createHandler({}) } } });\n',
      "src/lib/users.functions.ts":
        'import { createServerFn } from "@tanstack/react-start";\nimport { registerSources } from "@noverax/courier";\nexport const getUsers = createServerFn().handler(() => registerSources);\n',
      "src/lib/shared.ts":
        'import { createCaller } from "@noverax/courier";\nexport const caller = createCaller;\n',
    };
    const { after, steps } = upgraded({
      "package.json": manifest({
        dependencies: {
          "@tanstack/react-start": "1.169.4",
          react: "19.0.0",
          "react-dom": "19.0.0",
        },
        devDependencies: { vite: "8.0.0" },
      }),
      "src/router.tsx":
        'import { Route } from "./routes/index";\nimport { Route as Users } from "./routes/api/users";\nexport const routes = [Route, Users];\n',
      ...files,
    });
    const moved = (file: keyof typeof files, entry: string) =>
      files[file].replace('"@noverax/courier"', `"@noverax/courier/${entry}"`);

    expect(after("src/routes/index.tsx")).toBe(moved("src/routes/index.tsx", "client"));
    expect(after("src/routes/api/users.ts")).toBe(moved("src/routes/api/users.ts", "server"));
    expect(after("src/lib/users.functions.ts")).toBe(moved("src/lib/users.functions.ts", "server"));
    expect(after("src/lib/shared.ts")).toBeUndefined();
    expect(steps("src/lib/shared.ts")).toHaveLength(1);
  });

  it("takes to /server what a Start route uses only in code Start takes out of a page, and to /client what only <ClientOnly> renders", () => {
    const files = {
      "src/routes/account.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { createServerFn } from "@tanstack/react-start";\nimport { createCaller } from "@noverax/courier";\nimport { isHTTPError } from "@noverax/courier";\nconst caller = createCaller({});\nconst getAccount = createServerFn().validator((input) => input).handler(() => caller);\nexport const Route = createFileRoute("/account")({ loader: () => getAccount(), component: () => isHTTPError });\n',
      "src/routes/mixed.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { createHandler, getSources } from "@noverax/courier";\nexport const Route = createFileRoute("/mixed")({\n  server: { handlers: { GET: createHandler({}) } },\n  headers: () => ({ "x-sources": String(getSources()) }),\n  component: () => null,\n});\n',
      "src/routes/widget.tsx":
        'import { createFileRoute, ClientOnly } from "@tanstack/react-router";\nimport { createCaller } from "@noverax/courier";\nexport const Route = createFileRoute("/widget")({ component: () => <ClientOnly fallback={null}>{String(createCaller({}))}</ClientOnly> });\n',
    };
    const { after, steps } = upgraded({ "package.json": START_PACKAGE, ...files });
    const moved = (file: keyof typeof files, entry: string) =>
      files[file].replaceAll('"@noverax/courier"', `"@noverax/courier/${entry}"`);

    expect(after("src/routes/account.tsx")).toBe(
      files["src/routes/account.tsx"]
        .replace(
          '{ createCaller } from "@noverax/courier"',
          '{ createCaller } from "@noverax/courier/server"',
        )
        .replace(
          '{ isHTTPError } from "@noverax/courier"',
          '{ isHTTPError } from "@noverax/courier/client"',
        ),
    );
    expect(after("src/routes/mixed.tsx")).toBe(moved("src/routes/mixed.tsx", "server"));
    expect(after("src/routes/widget.tsx")).toBe(moved("src/routes/widget.tsx", "client"));
    for (const file of Object.keys(files)) expect(steps(file)).toEqual([]);
  });

  it("takes Start's src/start.ts imports to the side whose function alone uses them", () => {
    const start =
      'import { createClientOnlyFn, createIsomorphicFn, createMiddleware, createServerOnlyFn, createStart } from "@tanstack/react-start";\nimport { registerSources } from "@noverax/courier";\nimport { createCaller } from "@noverax/courier";\nimport { ensureCsrfToken } from "@noverax/courier";\nimport { getSources } from "@noverax/courier";\nexport const sources = createIsomorphicFn().server(() => registerSources).client(() => createCaller);\nexport const pageCaller = createClientOnlyFn(() => createCaller);\nexport const csrf = createMiddleware().server(({ next }) => {\n  ensureCsrfToken;\n  return next();\n});\nexport const listed = createServerOnlyFn(() => getSources());\nexport const startInstance = createStart(() => ({ requestMiddleware: [csrf] }));\n';
    const { after, steps } = upgraded({ "package.json": START_PACKAGE, "src/start.ts": start });

    expect(after("src/start.ts")).toBe(
      start
        .replace(
          '{ registerSources } from "@noverax/courier"',
          '{ registerSources } from "@noverax/courier/server"',
        )
        .replace(
          '{ createCaller } from "@noverax/courier"',
          '{ createCaller } from "@noverax/courier/client"',
        )
        .replace(
          '{ ensureCsrfToken } from "@noverax/courier"',
          '{ ensureCsrfToken } from "@noverax/courier/server"',
        )
        .replace(
          '{ getSources } from "@noverax/courier"',
          '{ getSources } from "@noverax/courier/server"',
        ),
    );
    expect(steps("src/start.ts")).toEqual([]);
  });

  it("keeps in the root a Start module's import whose names the page's build keeps beside the server's, and says what Start takes out of a page", () => {
    const { after, steps } = upgraded({
      "package.json": START_PACKAGE,
      "src/routes/both.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { createServerFn } from "@tanstack/react-start";\nimport { createCaller } from "@noverax/courier";\nconst getBoth = createServerFn().handler(() => createCaller({}));\nexport const Route = createFileRoute("/both")({ loader: () => [getBoth(), createCaller({})], component: () => null });\n',
      "src/start.ts":
        'import { createIsomorphicFn } from "@tanstack/react-start";\nimport { createHandler, isHTTPError } from "@noverax/courier";\nexport const handled = createIsomorphicFn().server(() => createHandler({}));\nexport const failed = isHTTPError;\n',
    });

    expect(after("src/routes/both.tsx")).toBeUndefined();
    expect(steps("src/routes/both.tsx")).toEqual([
      {
        file: "src/routes/both.tsx",
        what: "line 3: TanStack Start takes out of a page the code only the server runs — a server function's handler and validator, a route's server, ssr and headers, and what createServerOnlyFn, createIsomorphicFn().server() and createMiddleware().server() are given — but the page's build keeps createCaller, the server's caller as @noverax/courier gives it: the import stays in @noverax/courier, and the page's bundle takes the server's part with it",
        lines: [
          'import { createCaller } from "@noverax/courier/client"; // where only the page\'s code uses it',
          'import { createCaller } from "@noverax/courier/server"; // where only code Start takes out of a page uses it',
        ],
      },
    ]);
    expect(after("src/start.ts")).toBeUndefined();
    expect(steps("src/start.ts")).toEqual([
      {
        file: "src/start.ts",
        what: "line 2: TanStack Start takes out of a page the code that uses createHandler, but the page's build keeps isHTTPError: the import stays in @noverax/courier, and the page's bundle takes the server's part with it",
        lines: [
          'import { isHTTPError } from "@noverax/courier/client";',
          'import { createHandler } from "@noverax/courier/server"; // where only code Start takes out of a page uses it',
        ],
      },
    ]);
    for (const step of [...steps("src/routes/both.tsx"), ...steps("src/start.ts")])
      expect(step.what).not.toMatch(/a page loads this file/);
  });

  it("follows a Start route's options in a variable, an alias of createServerFn and a module only a server function uses, as Start's build does", () => {
    const files = {
      "src/routes/opts.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { createHandler } from "@noverax/courier";\nconst options = { server: { handlers: { GET: () => createHandler({}) } }, component: () => null };\nexport const Route = createFileRoute("/opts")(options);\n',
      "src/routes/alias.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { createServerFn } from "@tanstack/react-start";\nimport { createCaller } from "@noverax/courier";\nconst serverFn = createServerFn;\nconst getMe = serverFn().handler(() => createCaller({}));\nexport const Route = createFileRoute("/alias")({ loader: () => getMe(), component: () => null });\n',
      "src/routes/db-user.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { createServerFn } from "@tanstack/react-start";\nimport { db } from "../lib/db";\nconst getDb = createServerFn().handler(() => String(db));\nexport const Route = createFileRoute("/db-user")({ loader: () => getDb(), component: () => null });\n',
      "src/lib/db.ts":
        'import { createHandler } from "@noverax/courier";\nexport const db = createHandler({});\n',
      "src/routes/exported.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { createServerFn } from "@tanstack/react-start";\nimport { createCaller } from "@noverax/courier";\nexport const caller = createCaller({});\nconst getMe = createServerFn().handler(() => caller);\nexport const Route = createFileRoute("/exported")({ loader: () => getMe(), component: () => null });\n',
    };
    const { after, steps } = upgraded({ "package.json": START_PACKAGE, ...files });
    const moved = (file: keyof typeof files) =>
      files[file].replace('"@noverax/courier"', '"@noverax/courier/server"');

    for (const file of ["src/routes/opts.tsx", "src/routes/alias.tsx", "src/lib/db.ts"] as const) {
      expect(after(file)).toBe(moved(file));
      expect(steps(file)).toEqual([]);
    }
    expect(after("src/routes/exported.tsx")).toBeUndefined();
    expect(steps("src/routes/exported.tsx")).toEqual([
      expect.objectContaining({
        what: expect.stringMatching(
          /but the page's build keeps createCaller, the server's caller as @noverax\/courier gives it/,
        ),
      }),
    ]);
  });

  it("follows a function a Start route takes from another module of the project, as Start's compiler does, and keeps options another module gives, which Start's router does not follow", () => {
    const files = {
      "src/lib/start-fns.ts":
        'export { createServerFn as serverFn } from "@tanstack/react-start";\n',
      "src/lib/fns.ts":
        'import { createMiddleware, createServerFn } from "@tanstack/react-start";\nconst auth = createMiddleware().server(({ next }) => next());\nexport const authed = createServerFn({ method: "GET" }).middleware([auth]);\n',
      "src/lib/index.ts": 'export * from "./fns";\n',
      "src/routes/elsewhere.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { serverFn } from "../lib/start-fns";\nimport { createCaller } from "@noverax/courier";\nconst getMe = serverFn().handler(() => createCaller({}));\nexport const Route = createFileRoute("/elsewhere")({ loader: () => getMe(), component: () => null });\n',
      "src/routes/elsewhere-db.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { serverFn } from "../lib/start-fns";\nimport { db3 } from "../lib/db3";\nconst getDb = serverFn().handler(() => String(db3));\nexport const Route = createFileRoute("/elsewhere-db")({ loader: () => getDb(), component: () => null });\n',
      "src/lib/db3.ts":
        'import { createHandler } from "@noverax/courier";\nexport const db3 = createHandler({});\n',
      "src/routes/authed-caller.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { authed } from "../lib/fns";\nimport { createCaller } from "@noverax/courier";\nconst getMe = authed.handler(() => createCaller({}));\nexport const Route = createFileRoute("/authed-caller")({ loader: () => getMe(), component: () => null });\n',
      "src/routes/authed-db.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { authed } from "../lib/fns";\nimport { db4 } from "../lib/db4";\nconst getDb = authed.handler(() => String(db4));\nexport const Route = createFileRoute("/authed-db")({ loader: () => getDb(), component: () => null });\n',
      "src/lib/db4.ts":
        'import { createHandler } from "@noverax/courier";\nexport const db4 = createHandler({});\n',
      "src/routes/barrel.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { authed } from "../lib";\nimport { createCaller } from "@noverax/courier";\nconst getMe = authed.handler(() => createCaller({}));\nexport const Route = createFileRoute("/barrel")({ loader: () => getMe(), component: () => null });\n',
      "src/lib/options.ts":
        'import { createHandler } from "@noverax/courier";\nexport const options = { server: { handlers: { GET: () => createHandler({}) } }, component: () => null };\n',
      "src/routes/given.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { options } from "../lib/options";\nexport const Route = createFileRoute("/given")(options);\n',
    };
    const { after, steps } = upgraded({ "package.json": START_PACKAGE, ...files });
    const moved = (file: keyof typeof files) =>
      files[file].replace('"@noverax/courier"', '"@noverax/courier/server"');

    for (const file of [
      "src/routes/elsewhere.tsx",
      "src/lib/db3.ts",
      "src/routes/authed-caller.tsx",
      "src/lib/db4.ts",
      "src/routes/barrel.tsx",
    ] as const) {
      expect(after(file)).toBe(moved(file));
      expect(steps(file)).toEqual([]);
    }
    expect(after("src/lib/options.ts")).toBeUndefined();
    expect(steps("src/lib/options.ts")).toEqual([
      expect.objectContaining({
        what: expect.stringMatching(/but the page's build keeps createHandler/),
      }),
    ]);
  });

  it("follows a builder another module gives on with no from: by an export of its name, a declaration of it and its default", () => {
    const route = (path: string, from: string, name: string) =>
      `import { createFileRoute } from "@tanstack/react-router";\nimport ${name} from "${from}";\nimport { createCaller } from "@noverax/courier";\nconst getMe = protectedFn.handler(() => createCaller({}));\nexport const Route = createFileRoute("${path}")({ loader: () => getMe(), component: () => null });\n`;
    const files = {
      "src/lib/fns.ts":
        'import { createMiddleware, createServerFn } from "@tanstack/react-start";\nconst auth = createMiddleware().server(({ next }) => next());\nexport const authed = createServerFn({ method: "GET" }).middleware([auth]);\n',
      "src/lib/named.ts": 'import { authed } from "./fns";\nexport { authed as protectedFn };\n',
      "src/lib/declared.ts":
        'import { authed } from "./fns";\nexport const protectedFn = authed;\n',
      "src/lib/default.ts": 'import { authed } from "./fns";\nexport default authed;\n',
      "src/routes/named.tsx": route("/named", "../lib/named", "{ protectedFn }"),
      "src/routes/declared.tsx": route("/declared", "../lib/declared", "{ protectedFn }"),
      "src/routes/default.tsx": route("/default", "../lib/default", "protectedFn"),
      "src/routes/db6-user.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { protectedFn } from "../lib/declared";\nimport { db6 } from "../lib/db6";\nconst getDb = protectedFn.handler(() => String(db6));\nexport const Route = createFileRoute("/db6")({ loader: () => getDb(), component: () => null });\n',
      "src/lib/db6.ts":
        'import { createHandler } from "@noverax/courier";\nexport const db6 = createHandler({});\n',
    };
    const { after, steps } = upgraded({ "package.json": START_PACKAGE, ...files });

    for (const file of [
      "src/routes/named.tsx",
      "src/routes/declared.tsx",
      "src/routes/default.tsx",
      "src/lib/db6.ts",
    ] as const) {
      expect(after(file)).toBe(
        files[file].replace('"@noverax/courier"', '"@noverax/courier/server"'),
      );
      expect(steps(file)).toEqual([]);
    }
  });

  it("keeps a Start route's import of redact, which a page takes from the root, calls it no name of the server's, and takes one only the server's code uses to /server", () => {
    const { after, steps } = upgraded({
      "package.json": START_PACKAGE,
      "src/routes/masked.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { redact } from "@noverax/courier";\nexport const Route = createFileRoute("/masked")({ component: () => String(redact("x")) });\n',
      "src/routes/masked-api.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { createHandler, redact } from "@noverax/courier";\nexport const Route = createFileRoute("/masked-api")({\n  server: { handlers: { GET: () => createHandler({}) } },\n  component: () => String(redact("x")),\n});\n',
      "src/routes/masked-both.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { createHandler, isHTTPError, redact } from "@noverax/courier";\nexport const Route = createFileRoute("/masked-both")({\n  server: { handlers: { GET: () => createHandler({}) } },\n  component: () => String(isHTTPError(null) || redact("x")),\n});\n',
      "src/routes/masked-log.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { redact } from "@noverax/courier";\nexport const Route = createFileRoute("/masked-log")({\n  server: { handlers: { GET: () => new Response(String(redact("x"))) } },\n});\n',
    });

    expect(after("src/routes/masked-log.tsx")).toContain(
      'import { redact } from "@noverax/courier/server";',
    );
    expect(steps("src/routes/masked-log.tsx")).toEqual([]);
    expect(after("src/routes/masked-both.tsx")).toBeUndefined();
    expect(steps("src/routes/masked-both.tsx")).toEqual([
      {
        file: "src/routes/masked-both.tsx",
        what: "line 2: TanStack Start takes out of a page the code that uses createHandler, but the page's build keeps isHTTPError, and redact, which @noverax/courier/client leaves out, so a page takes it from @noverax/courier: the import stays there",
        lines: [
          'import { isHTTPError } from "@noverax/courier/client";',
          'import { redact } from "@noverax/courier"; // a page takes it from the root',
          'import { createHandler } from "@noverax/courier/server"; // where only code Start takes out of a page uses it',
        ],
      },
    ]);
    expect(after("src/routes/masked.tsx")).toBeUndefined();
    expect(steps("src/routes/masked.tsx")).toEqual([
      {
        file: "src/routes/masked.tsx",
        what: "line 2: @noverax/courier/client leaves redact out, so a page takes it from @noverax/courier: the import stays there",
        lines: [],
      },
    ]);
    expect(after("src/routes/masked-api.tsx")).toBeUndefined();
    expect(steps("src/routes/masked-api.tsx")).toEqual([
      {
        file: "src/routes/masked-api.tsx",
        what: "line 2: TanStack Start takes out of a page the code that uses createHandler, but the page's build keeps redact, which @noverax/courier/client leaves out, so a page takes it from @noverax/courier: the import stays there",
        lines: [
          'import { redact } from "@noverax/courier"; // a page takes it from the root',
          'import { createHandler } from "@noverax/courier/server"; // where only code Start takes out of a page uses it',
        ],
      },
    ]);
  });

  it("gives the page's module of a file only a function Courier did not follow imports redact from the root", () => {
    const { after, steps } = upgraded({
      "package.json": START_PACKAGE,
      "src/routes/masked-kit.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { authed } from "@acme/start-kit";\nimport { mask } from "../lib/mask";\nconst getMask = authed.handler(() => mask(null));\nexport const Route = createFileRoute("/masked-kit")({ loader: () => getMask(), component: () => null });\n',
      "src/lib/mask.ts":
        'import { isHTTPError, redact } from "@noverax/courier";\nexport const mask = (error: unknown) => (isHTTPError(error) ? redact("x") : "");\n',
    });

    expect(after("src/lib/mask.ts")).toBeUndefined();
    expect(steps("src/lib/mask.ts")).toEqual([
      {
        file: "src/lib/mask.ts",
        what: "line 1: Courier could not follow authed, which src/routes/masked-kit.tsx takes from @acme/start-kit, to a function of TanStack Start's, whose build may take the code that imports this file out of a page, so its import stays in @noverax/courier: if only that code imports this file, take isHTTPError and redact from @noverax/courier/server, and otherwise give the page its own module, with redact, which @noverax/courier/client leaves out, from @noverax/courier",
        lines: [
          'import { isHTTPError, redact } from "@noverax/courier/server"; // if only that code imports this file',
          'import { isHTTPError } from "@noverax/courier/client"; // in the page\'s module',
          'import { redact } from "@noverax/courier"; // in the page\'s module',
        ],
      },
    ]);
  });

  it("says Courier could not follow a function from outside the project, where a route takes it and where only its handler imports a module, and keeps what Start does not follow either", () => {
    const { after, steps } = upgraded({
      "package.json": START_PACKAGE,
      "src/lib/fns.ts":
        'import { createServerFn } from "@tanstack/react-start";\nexport const authed = createServerFn({ method: "GET" });\n',
      "src/routes/outside.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport { authed } from "@acme/start-kit";\nimport { createCaller } from "@noverax/courier";\nimport { db5 } from "../lib/db5";\nconst getMe = authed.handler(() => [createCaller({}), db5]);\nexport const Route = createFileRoute("/outside")({ loader: () => getMe(), component: () => null });\n',
      "src/lib/db5.ts":
        'import { createHandler } from "@noverax/courier";\nexport const db5 = createHandler({});\n',
      "src/routes/ns-member.tsx":
        'import { createFileRoute } from "@tanstack/react-router";\nimport * as fns from "../lib/fns";\nimport { createCaller } from "@noverax/courier";\nconst getMe = fns.authed.handler(() => createCaller({}));\nexport const Route = createFileRoute("/ns-member")({ loader: () => getMe(), component: () => null });\n',
    });

    expect(after("src/routes/outside.tsx")).toBeUndefined();
    expect(steps("src/routes/outside.tsx")).toEqual([
      {
        file: "src/routes/outside.tsx",
        what: "line 3: Courier could not follow authed, which this file takes from @acme/start-kit, to a function of TanStack Start's, whose build may take the code it is given out of a page, so the import stays in @noverax/courier: if only that code uses createCaller, take it from @noverax/courier/server, and otherwise give the page its own module",
        lines: [
          'import { createCaller } from "@noverax/courier/server"; // where only code Start takes out of a page uses it',
          'import { createCaller } from "@noverax/courier/client"; // in the page\'s module',
        ],
      },
    ]);
    expect(after("src/lib/db5.ts")).toBeUndefined();
    expect(steps("src/lib/db5.ts")).toEqual([
      {
        file: "src/lib/db5.ts",
        what: "line 1: Courier could not follow authed, which src/routes/outside.tsx takes from @acme/start-kit, to a function of TanStack Start's, whose build may take the code that imports this file out of a page, so its import stays in @noverax/courier: if only that code imports this file, take createHandler from @noverax/courier/server, and otherwise give the page its own module",
        lines: [
          'import { createHandler } from "@noverax/courier/server"; // if only that code imports this file',
        ],
      },
    ]);
    expect(after("src/routes/ns-member.tsx")).toBeUndefined();
    expect(steps("src/routes/ns-member.tsx")).toEqual([
      expect.objectContaining({
        what: expect.stringMatching(/but the page's build keeps createCaller/),
      }),
    ]);
  });

  it("takes Start's direct calls as its compiler does: a renamed one only as the value of a declaration at the module's top", () => {
    const start =
      'import { createServerOnlyFn as serverOnly } from "@tanstack/react-start";\nimport { getSources } from "@noverax/courier";\nimport { registerSources } from "@noverax/courier";\nexport const listed = serverOnly(() => getSources());\nexport function register() {\n  return serverOnly(() => registerSources);\n}\n';
    const { after, steps } = upgraded({ "package.json": START_PACKAGE, "src/start.ts": start });

    expect(after("src/start.ts")).toBe(
      start.replace(
        '{ getSources } from "@noverax/courier"',
        '{ getSources } from "@noverax/courier/server"',
      ),
    );
    expect(steps("src/start.ts")).toEqual([
      expect.objectContaining({
        what: expect.stringMatching(/^line 3: .*but the page's build keeps registerSources/),
      }),
    ]);
  });

  it("takes every file of a server framework to /server, and leaves the page's own names in the root", () => {
    const { after, steps } = upgraded({
      "package.json": manifest({ dependencies: { express: "5.0.0" } }),
      "src/server.ts": 'import { createHandler, isHTTPError } from "@noverax/courier";\n',
      "src/fetcher.ts": 'import { createFetch } from "@noverax/courier";\n',
    });

    expect(after("src/server.ts")).toContain('from "@noverax/courier/server"');
    expect(after("src/fetcher.ts")).toBeUndefined();
    expect(steps("src/fetcher.ts")).toEqual([]);
  });

  it("takes an API route of Expo Router's under src/app to /server, and its screens to /client", () => {
    const { after } = upgraded({
      "package.json": manifest({ dependencies: { expo: "58.0.0", "expo-router": "7.0.0" } }),
      "src/app/api/items+api.ts":
        'import { createCaller } from "@noverax/courier";\nexport async function GET() {}\n',
      "src/app/index.tsx":
        'import { createCaller } from "@noverax/courier";\nexport default function Home() {}\n',
    });

    expect(after("src/app/api/items+api.ts")).toContain('from "@noverax/courier/server"');
    expect(after("src/app/index.tsx")).toContain('from "@noverax/courier/client"');
  });

  it("takes React Router's .server modules to /server and its .client modules to /client", () => {
    const { after } = upgraded({
      "package.json": manifest({ dependencies: { "@react-router/dev": "7.0.0" } }),
      "app/routes/home.tsx":
        'import { caller } from "../.server/caller";\nimport { track } from "../.client/track";\nexport async function loader() {}\nexport default function Home() {}\n',
      "app/.server/caller.ts": 'import { createCaller } from "@noverax/courier";\n',
      "app/.client/track.ts": 'import { isHTTPError } from "@noverax/courier";\n',
    });

    expect(after("app/.server/caller.ts")).toBe(
      'import { createCaller } from "@noverax/courier/server";\n',
    );
    expect(after("app/.client/track.ts")).toBe(
      'import { isHTTPError } from "@noverax/courier/client";\n',
    );
  });

  it("takes a SolidStart API route to /server", () => {
    const { after } = upgraded({
      "package.json": manifest({ dependencies: { "@solidjs/start": "2.0.0" } }),
      "src/routes/api/users.ts":
        'import { createCaller } from "@noverax/courier";\nexport async function GET() {}\n',
    });

    expect(after("src/routes/api/users.ts")).toContain('from "@noverax/courier/server"');
  });

  it("takes a page built with Vite beside an Express server to /client, and the server's files to /server", () => {
    const { after } = upgraded({
      "package.json": manifest({
        dependencies: { express: "5.0.0", react: "19.0.0", vite: "7.0.0" },
      }),
      "index.html": '<script type="module" src="/src/main.tsx"></script>\n',
      "src/main.tsx": 'import { isHTTPError } from "@noverax/courier";\nimport "./api";\n',
      "src/api.ts": 'import { createCaller } from "@noverax/courier";\n',
      "server/index.ts": 'import { createHandler } from "@noverax/courier";\n',
    });

    expect(after("src/main.tsx")).toContain('from "@noverax/courier/client"');
    expect(after("src/api.ts")).toContain('from "@noverax/courier/client"');
    expect(after("server/index.ts")).toContain('from "@noverax/courier/server"');
  });

  it("takes what a page's import.meta.glob and new URL load to /client, and names a glob it cannot read", () => {
    const { after, steps } = upgraded({
      "package.json": manifest({
        dependencies: { express: "5.0.0", react: "19.0.0", vite: "7.0.0" },
      }),
      "index.html": '<script type="module" src="/src/main.tsx"></script>\n',
      "src/main.tsx": `const pages = import.meta.glob("./pages/*.tsx", { eager: true });\nconst sync = new Worker(new URL("./workers/sync.ts", import.meta.url), { type: "module" });\nconst more = import.meta.glob(\`./more/\${name}.tsx\`);\n`,
      "src/pages/Home.tsx": 'import { createCaller } from "@noverax/courier";\n',
      "src/workers/sync.ts": 'import { isHTTPError } from "@noverax/courier";\n',
      "server/index.ts": 'import { createHandler } from "@noverax/courier";\n',
    });

    expect(after("src/pages/Home.tsx")).toBe(
      'import { createCaller } from "@noverax/courier/client";\n',
    );
    expect(after("src/workers/sync.ts")).toBe(
      'import { isHTTPError } from "@noverax/courier/client";\n',
    );
    expect(after("server/index.ts")).toBe(
      'import { createHandler } from "@noverax/courier/server";\n',
    );
    expect(steps("src/main.tsx")).toEqual([
      {
        file: "src/main.tsx",
        what: expect.stringMatching(/^line 3: Not read: its import\.meta\.glob/),
        lines: [],
      },
    ]);
  });

  it("names a Nuxt config whose layers are not data, which it reads without Nuxt's rules", () => {
    const { steps } = upgraded({
      "package.json": manifest({ dependencies: { nuxt: "4.0.0" } }),
      "nuxt.config.ts":
        'const layers = process.env.LAYERS?.split(",") ?? [];\nexport default defineNuxtConfig({ extends: layers });\n',
      "pages/index.vue":
        '<script setup lang="ts">\nimport { isHTTPError } from "@noverax/courier";\n</script>\n',
    });

    expect(steps("nuxt.config.ts")).toEqual([
      {
        file: "nuxt.config.ts",
        what: "Not read: its extends is not data Courier reads, so the layers it names are read without Nuxt's rules",
        lines: [],
      },
    ]);
  });

  it("names an import a page may load by a package's name whose entry is its build's", () => {
    const { after, steps } = upgraded({
      "package.json": manifest({
        name: "acme",
        private: true,
        workspaces: ["apps/*", "packages/*"],
      }),
      "apps/web/package.json": manifest({ name: "web", dependencies: { next: "16.0.0" } }),
      "apps/web/app/panel.tsx": `"use client";\nimport { kit } from "@acme/kit";\n`,
      "packages/kit/package.json": manifest({ name: "@acme/kit", main: "./dist/index.js" }),
      "packages/kit/src/register.ts":
        'import { createHandler, isHTTPError } from "@noverax/courier";\n',
    });

    expect(after("packages/kit/src/register.ts")).toBeUndefined();
    expect(steps("packages/kit/src/register.ts")).toEqual([
      {
        file: "packages/kit/src/register.ts",
        what: expect.stringMatching(
          /^line 1: a page loads @acme\/kit by its name, and Courier could not follow its entry to its code, so this file's import stays in @noverax\/courier/,
        ),
        lines: [
          'import { isHTTPError } from "@noverax/courier/client"; // where a page loads it',
          'import { createHandler } from "@noverax/courier/server"; // where only the server does',
        ],
      },
    ]);
  });

  it("leaves the file of a package.json import a page's condition does not give with nothing to say", () => {
    const { after, steps } = upgraded({
      "package.json": manifest({
        name: "web",
        dependencies: { next: "16.0.0" },
        imports: { "#api": { browser: "./lib/api.browser.ts", default: "./lib/api.server.ts" } },
      }),
      "app/panel.tsx": '"use client";\nimport { api } from "#api";\nexport function Panel() {}\n',
      "lib/api.browser.ts":
        'import { isHTTPError } from "@noverax/courier";\nexport const api = 1;\n',
      "lib/api.server.ts":
        'import { createHandler } from "@noverax/courier";\nexport const api = 1;\n',
    });

    expect(after("lib/api.browser.ts")).toContain('from "@noverax/courier/client"');
    expect(after("lib/api.server.ts")).toBeUndefined();
    expect(steps("lib/api.server.ts")).toEqual([]);
  });

  it("names a package whose framework it does not know", () => {
    const { steps } = upgraded({
      "package.json": manifest({ name: "tools" }),
      "src/index.ts": 'import { isHTTPError, type CallOptions } from "@noverax/courier";\n',
    });

    expect(steps("src/index.ts")).toEqual([
      {
        file: "src/index.ts",
        what: expect.stringMatching(
          /^line 1: Courier knows no framework of this package's, so whether a page or the server loads this file is not told/,
        ),
        lines: [
          'import { isHTTPError, type CallOptions } from "@noverax/courier/client"; // where a page loads it',
          'import { isHTTPError, type CallOptions } from "@noverax/courier/server"; // where only the server does',
        ],
      },
    ]);
  });

  it("moves an import after the other migrations of 0.5.0 change its names, in one run", () => {
    const panel = `"use client";\nimport { isHTTPError } from "@noverax/courier";\nif (isHTTPError(error) && error.status === 0) retry();\n`;
    const { after } = upgraded(
      { ...NEXT, "src/components/Panel.tsx": panel },
      RELEASES.flatMap((release) => release.migrations),
    );

    expect(after("src/components/Panel.tsx")).toBe(
      `"use client";\nimport { isNetworkError, isTimeoutError } from "@noverax/courier/client";\nif (isNetworkError(error) || isTimeoutError(error)) retry();\n`,
    );
  });
});
