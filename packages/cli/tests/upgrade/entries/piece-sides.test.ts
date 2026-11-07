import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { projectCode } from "../../../src/upgrade/codemod/source-files";
import { projectSides } from "../../../src/upgrade/entries/piece-sides";
import { UPGRADE_LIMITS } from "../../../src/upgrade/limits";
import { workspaceOf } from "../../../src/upgrade/workspace";
import { manifest, projectWith, removeProjects } from "../../helpers/temp-project";

afterAll(removeProjects);

const CORE = 'import { isHTTPError } from "@noverax/courier";\n';

function sidesOf(files: Readonly<Record<string, string>>) {
  const root = projectWith(files);
  const workspace = workspaceOf(root);
  return projectSides(workspace, projectCode(root));
}

/* A piece's side, as three flags: certainly a page's, maybe a page's, maybe the server's. */
function flags(side: { page: boolean; maybePage: boolean; maybeServer: boolean }) {
  return [side.page, side.maybePage, side.maybeServer];
}

describe("the side of a piece of code", () => {
  it("follows a Next.js app's imports from its client components and its server's files", () => {
    const sides = sidesOf({
      "package.json": manifest({ name: "web", dependencies: { next: "16.0.0" } }),
      "tsconfig.json": '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
      "src/app/page.tsx":
        'import { Panel } from "@/components/Panel";\nimport { load } from "@/lib/server-api";\nexport default function Page() {}\n',
      "src/app/api/users/route.ts":
        'import { shared } from "../../../lib/shared";\nexport function GET() {}\n',
      "src/components/Panel.tsx": `"use client";\nimport { shared } from "@/lib/shared";\nimport { only } from "@/lib/client-only.js";\nimport type { Row } from "@/lib/server-api";\n${CORE}`,
      "src/lib/shared.ts": CORE,
      "src/lib/client-only.ts": CORE,
      "src/lib/server-api.ts": CORE,
      "src/lib/orphan.ts": CORE,
    });

    expect(flags(sides.sideOf("src/components/Panel.tsx", 0))).toEqual([true, true, false]);
    expect(flags(sides.sideOf("src/lib/shared.ts", 0))).toEqual([true, true, true]);
    expect(flags(sides.sideOf("src/lib/client-only.ts", 0))).toEqual([true, true, false]);
    expect(flags(sides.sideOf("src/lib/server-api.ts", 0))).toEqual([false, false, true]);
    expect(flags(sides.sideOf("src/app/page.tsx", 0))).toEqual([false, false, true]);
    expect(sides.sideOf("src/lib/orphan.ts", 0)).toMatchObject({
      page: false,
      maybePage: false,
      maybeServer: false,
      framework: "next",
      incomplete: false,
    });
  });

  it("gives an Astro page's frontmatter to the server and its scripts and islands to the page", () => {
    const sides = sidesOf({
      "package.json": manifest({ dependencies: { astro: "5.0.0" } }),
      "src/pages/index.astro": `---\nimport Counter from "../components/Counter.tsx";\nimport { data } from "../lib/data";\n---\n<Counter client:load />\n<script>\nimport { browser } from "../lib/browser";\n</script>\n`,
      "src/components/Counter.tsx": `${CORE}export default function Counter() {}\n`,
      "src/lib/data.ts": CORE,
      "src/lib/browser.ts": CORE,
    });

    expect(flags(sides.sideOf("src/pages/index.astro", 0))).toEqual([false, false, true]);
    expect(flags(sides.sideOf("src/pages/index.astro", 1))).toEqual([true, true, false]);
    expect(flags(sides.sideOf("src/components/Counter.tsx", 0))).toEqual([true, true, false]);
    expect(flags(sides.sideOf("src/lib/data.ts", 0))).toEqual([false, false, true]);
    expect(flags(sides.sideOf("src/lib/browser.ts", 0))).toEqual([true, true, false]);
  });

  it("takes an Astro page's frontmatter that takes a component's other names for running its module", () => {
    const sides = sidesOf({
      "package.json": manifest({ dependencies: { astro: "5.0.0" } }),
      "src/pages/index.astro": `---\nimport Users, { caller } from "../components/Users.tsx";\nimport * as Cards from "../components/Cards.tsx";\nimport Counter from "../components/Counter.tsx";\nconst users = await caller.users();\n---\n<Users client:load /><Counter client:load />\n`,
      "src/components/Users.tsx": `${CORE}export const caller = 1;\nexport default function Users() {}\n`,
      "src/components/Cards.tsx": `${CORE}export function Card() {}\n`,
      "src/components/Counter.tsx": `${CORE}export default function Counter() {}\n`,
    });

    expect(flags(sides.sideOf("src/components/Users.tsx", 0))).toEqual([true, true, true]);
    expect(flags(sides.sideOf("src/components/Cards.tsx", 0))).toEqual([true, true, true]);
    expect(flags(sides.sideOf("src/components/Counter.tsx", 0))).toEqual([true, true, false]);
  });

  it("takes a route module, and what it imports, for maybe a page's and maybe the server's", () => {
    const sides = sidesOf({
      "package.json": manifest({ dependencies: { "@react-router/dev": "7.0.0", react: "19.0.0" } }),
      "tsconfig.json": '{ "compilerOptions": { "paths": { "~/*": ["./app/*"] } } }',
      "app/routes/home.tsx": `import { api } from "~/lib/api";\n${CORE}export default function Home() {}\n`,
      "app/routes/api.request.ts": `${CORE}export function action() {}\n`,
      "app/lib/api.ts": CORE,
    });

    expect(flags(sides.sideOf("app/routes/home.tsx", 0))).toEqual([false, true, true]);
    expect(flags(sides.sideOf("app/lib/api.ts", 0))).toEqual([false, true, true]);
    expect(flags(sides.sideOf("app/routes/api.request.ts", 0))).toEqual([false, false, true]);
  });

  it("tells a Koa, hapi, Elysia, h3 or Nitro server beside a page built with Vite, and a package of one alone", () => {
    for (const server of ["koa", "@hapi/hapi", "elysia", "h3", "nitro"]) {
      const sides = sidesOf({
        "package.json": manifest({
          dependencies: { [server]: "1.0.0", react: "19.0.0" },
          devDependencies: { vite: "7.0.0" },
        }),
        "index.html": '<script type="module" src="/src/main.tsx"></script>\n',
        "src/main.tsx": `import { App } from "./App";\n${CORE}`,
        "src/App.tsx": CORE,
        "server/index.ts": CORE,
      });
      const alone = sidesOf({
        "package.json": manifest({ dependencies: { [server]: "1.0.0" } }),
        "src/index.ts": CORE,
      });

      expect(flags(sides.sideOf("src/App.tsx", 0))).toEqual([true, true, false]);
      expect(flags(sides.sideOf("server/index.ts", 0))).toEqual([false, false, true]);
      expect(flags(alone.sideOf("src/index.ts", 0))).toEqual([false, false, true]);
    }
  });

  it("follows import.meta.glob and new URL(…, import.meta.url) to the files they load, on the side of their file", () => {
    const sides = sidesOf({
      "package.json": manifest({
        dependencies: { express: "5.0.0", react: "19.0.0", vite: "7.0.0" },
      }),
      "tsconfig.json": '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
      "index.html": '<script type="module" src="/src/main.tsx"></script>\n',
      "src/main.tsx":
        'const pages = import.meta.glob(["./pages/*.tsx", "!./pages/Secret.tsx"], { eager: true });\nconst widgets = import.meta.glob("@/widgets/**/*.{ts,tsx}");\nconst sync = new Worker(new URL("./workers/sync.ts", import.meta.url), { type: "module" });\n',
      "src/pages/Home.tsx": CORE,
      "src/pages/Secret.tsx": CORE,
      "src/widgets/charts/Bar.tsx": CORE,
      "src/workers/sync.ts": CORE,
      "server/index.ts": 'import { caller } from "./caller";\n',
      "server/caller.ts": CORE,
    });

    expect(flags(sides.sideOf("src/pages/Home.tsx", 0))).toEqual([true, true, false]);
    expect(flags(sides.sideOf("src/widgets/charts/Bar.tsx", 0))).toEqual([true, true, false]);
    expect(flags(sides.sideOf("src/workers/sync.ts", 0))).toEqual([true, true, false]);
    expect(flags(sides.sideOf("src/pages/Secret.tsx", 0))).toEqual([false, false, true]);
    expect(flags(sides.sideOf("server/caller.ts", 0))).toEqual([false, false, true]);
  });

  it("reads a template with no insertion in import.meta.glob and new URL as a string, and one with insertions by its first part", () => {
    const sides = sidesOf({
      "package.json": manifest({
        dependencies: { express: "5.0.0", react: "19.0.0", vite: "7.0.0" },
      }),
      "index.html": '<script type="module" src="/src/main.tsx"></script>\n',
      "src/main.tsx": `const pages = import.meta.glob(\`./pages/*.tsx\`, { eager: true });\nconst views = import.meta.glob("./*.tsx", { base: \`./views\` });\nconst icon = new URL(\`./icons/\${name}.ts\`, import.meta.url);\nconst sync = new Worker(new URL(\`./workers/sync.ts\`, import.meta.url), { type: "module" });\n`,
      "src/pages/Home.tsx": CORE,
      "src/views/List.tsx": CORE,
      "src/icons/cart.ts": CORE,
      "src/workers/sync.ts": CORE,
      "server/index.ts": 'import { caller } from "./caller";\n',
      "server/caller.ts": CORE,
    });

    expect(flags(sides.sideOf("src/pages/Home.tsx", 0))).toEqual([true, true, false]);
    expect(flags(sides.sideOf("src/views/List.tsx", 0))).toEqual([true, true, false]);
    expect(flags(sides.sideOf("src/icons/cart.ts", 0))).toEqual([false, true, false]);
    expect(flags(sides.sideOf("src/workers/sync.ts", 0))).toEqual([true, true, false]);
    expect(flags(sides.sideOf("server/caller.ts", 0))).toEqual([false, false, true]);
    expect(sides.notes()).toEqual([]);
  });

  it("takes a file a query names by what Vite loads of it: a worker's code on the file's side, an address it may load, a text it never runs", () => {
    const sides = sidesOf({
      "package.json": manifest({
        dependencies: { express: "5.0.0", react: "19.0.0", vite: "7.0.0" },
      }),
      "index.html": '<script type="module" src="/src/main.tsx"></script>\n',
      "src/main.tsx":
        'import A from "./workers/a.ts?worker";\nimport B from "./workers/b?sharedworker";\nimport C from "./workers/c.ts?worker&inline";\nimport d from "./paint/d.ts?url";\nimport e from "./lib/e.ts?inline";\nimport f from "./notes/f.ts?raw";\nconst shown = import.meta.glob("./examples/*.ts", { query: "?raw", import: "default" });\nconst painted = import.meta.glob("./worklets/*.ts", { query: "url" });\nconst kept = import.meta.glob("./kept/*.ts", { as: "raw" });\n',
      "src/workers/a.ts": CORE,
      "src/workers/b.ts": CORE,
      "src/workers/c.ts": CORE,
      "src/paint/d.ts": CORE,
      "src/lib/e.ts": CORE,
      "src/notes/f.ts": CORE,
      "src/examples/g.ts": CORE,
      "src/worklets/h.ts": CORE,
      "src/kept/i.ts": CORE,
      "server/index.ts": 'import { caller } from "./caller";\n',
      "server/caller.ts": CORE,
    });

    for (const file of ["src/workers/a.ts", "src/workers/b.ts", "src/workers/c.ts", "src/lib/e.ts"])
      expect(flags(sides.sideOf(file, 0))).toEqual([true, true, false]);
    for (const file of ["src/paint/d.ts", "src/worklets/h.ts"])
      expect(flags(sides.sideOf(file, 0))).toEqual([false, true, false]);
    for (const file of ["src/notes/f.ts", "src/examples/g.ts", "src/kept/i.ts"])
      expect(flags(sides.sideOf(file, 0))).toEqual([false, false, true]);
  });

  it("reads a / in a glob, its base and an import from the root Vite may take: the folder of the HTML page it builds from", () => {
    const sides = sidesOf({
      "package.json": manifest({
        dependencies: { express: "5.0.0", react: "19.0.0", vite: "7.0.0" },
      }),
      "client/index.html": '<script type="module" src="./src/main.tsx"></script>\n',
      "client/src/main.tsx":
        'import { api } from "/src/lib/api";\nconst pages = import.meta.glob("/src/pages/*.tsx", { eager: true });\nconst views = import.meta.glob("./*.tsx", { base: "/src/views" });\n',
      "client/src/lib/api.ts": CORE,
      "client/src/pages/Home.tsx": CORE,
      "client/src/views/List.tsx": CORE,
      "server/index.ts": 'import { caller } from "./caller";\n',
      "server/caller.ts": CORE,
    });

    for (const file of [
      "client/src/lib/api.ts",
      "client/src/pages/Home.tsx",
      "client/src/views/List.tsx",
    ])
      expect(flags(sides.sideOf(file, 0))).toEqual([true, true, false]);
    expect(flags(sides.sideOf("server/caller.ts", 0))).toEqual([false, false, true]);
  });

  it("takes no side of a package beside h3 or Nitro whose page's framework no list knows: Analog's", () => {
    const sides = sidesOf({
      "package.json": manifest({
        dependencies: { "@angular/core": "20.3.0", "@analogjs/platform": "2.0.0", h3: "1.15.0" },
        devDependencies: { vite: "7.0.0" },
      }),
      "index.html":
        '<analog-app></analog-app>\n<script type="module" src="/src/main.ts"></script>\n',
      "src/main.ts": 'import "./app/app.config";\n',
      "src/app/app.config.ts": CORE,
      "src/app/pages/index.page.ts": CORE,
      "src/server/routes/api/hello.ts": `${CORE}export default defineEventHandler(() => "hello");\n`,
    });

    for (const file of [
      "src/app/app.config.ts",
      "src/app/pages/index.page.ts",
      "src/server/routes/api/hello.ts",
    ])
      expect(sides.sideOf(file, 0)).toMatchObject({
        page: false,
        maybePage: false,
        maybeServer: false,
        framework: undefined,
      });
  });

  it("reads Expo Router's root from an app.config written as data, without running it, and names one that is not", () => {
    const EXPO = {
      main: "expo-router/entry",
      dependencies: { expo: "58.0.0", "expo-router": "7.0.0" },
    };
    const routes = {
      "package.json": manifest(EXPO),
      "src/routes/hello+api.ts": `${CORE}export function GET() {}\n`,
      "src/routes/index.tsx": `${CORE}export default function Home() {}\n`,
    };
    const configs: Array<[string, string]> = [
      [
        "app.config.ts",
        'export default { name: "app", plugins: [["expo-router", { root: "./src/routes" }]] };\n',
      ],
      [
        "app.config.ts",
        'import type { ConfigContext, ExpoConfig } from "expo/config";\nexport default ({ config }: ConfigContext): ExpoConfig => ({\n  ...config,\n  plugins: [["expo-router", { root: "./src/routes" }]],\n});\n',
      ],
      [
        "app.config.ts",
        'const config = { expo: { plugins: [["expo-router", { root: "./src/routes" }]] } } satisfies object;\nexport default config;\n',
      ],
      [
        "app.config.js",
        'module.exports = function () {\n  return { plugins: ["expo-font", ["expo-router", { root: "./src/routes" }]] };\n};\n',
      ],
      [
        "app.config.ts",
        "export default { plugins: [[`expo-router`, { root: `./src/routes` }]] };\n",
      ],
    ];
    for (const [file, config] of configs) {
      const sides = sidesOf({ ...routes, [file]: config });

      expect(flags(sides.sideOf("src/routes/hello+api.ts", 0))).toEqual([false, false, true]);
      expect(flags(sides.sideOf("src/routes/index.tsx", 0))).toEqual([true, true, false]);
      expect(sides.notes()).toEqual([]);
    }
    const spread = sidesOf({
      ...routes,
      "app.json": JSON.stringify({
        expo: { plugins: [["expo-router", { root: "./src/routes" }]] },
      }),
      "app.config.ts": 'export default ({ config }) => ({ ...config, name: "app" });\n',
    });
    const unread = sidesOf({
      ...routes,
      "app.config.ts":
        'export default ({ config }) => ({\n  ...config,\n  plugins: [["expo-router", { root: process.env.ROUTES }]],\n});\n',
    });

    expect(flags(spread.sideOf("src/routes/index.tsx", 0))).toEqual([true, true, false]);
    expect(flags(unread.sideOf("src/routes/hello+api.ts", 0))).toEqual([false, false, false]);
    expect(unread.notes()).toEqual([
      {
        file: "app.config.ts",
        what: "Not read: its expo-router root is not data Courier reads, so Expo Router's routes are read from app",
      },
    ]);
  });

  it("keeps React Router's .server modules out of a page and its .client modules out of the server", () => {
    const files = (dev: Record<string, string>) => ({
      "package.json": manifest({ dependencies: { ...dev, react: "19.0.0" } }),
      "app/routes/home.tsx":
        'import { caller } from "../.server/caller";\nimport { db } from "../db.server";\nimport { track } from "../.client/track";\nimport { mark } from "../mark.client";\nexport async function loader() {}\nexport default function Home() {}\n',
      "app/.server/caller.ts": `import { keys } from "../lib/.server/keys";\n${CORE}`,
      "app/lib/.server/keys.ts": CORE,
      "app/db.server.ts": CORE,
      "app/.client/track.ts": CORE,
      "app/mark.client.ts": CORE,
    });

    for (const dev of [{ "@react-router/dev": "7.0.0" }, { "@remix-run/dev": "2.17.0" }]) {
      const sides = sidesOf(files(dev));

      expect(flags(sides.sideOf("app/routes/home.tsx", 0))).toEqual([false, true, true]);
      expect(flags(sides.sideOf("app/.server/caller.ts", 0))).toEqual([false, false, true]);
      expect(flags(sides.sideOf("app/lib/.server/keys.ts", 0))).toEqual([false, false, true]);
      expect(flags(sides.sideOf("app/db.server.ts", 0))).toEqual([false, false, true]);
      expect(flags(sides.sideOf("app/.client/track.ts", 0))).toEqual([true, true, false]);
      expect(flags(sides.sideOf("app/mark.client.ts", 0))).toEqual([true, true, false]);
    }
  });

  it("reads Expo Router's routes from src/app, or the folder app.json names, and gives the server its route files there", () => {
    const EXPO = {
      main: "expo-router/entry",
      dependencies: { expo: "58.0.0", "expo-router": "7.0.0" },
    };
    const app = sidesOf({
      "package.json": manifest(EXPO),
      "src/app/_layout.tsx": "export default function Layout() {}\n",
      "src/app/index.tsx":
        'import { client } from "../lib/client";\nimport { shared } from "../lib/shared";\nexport default function Home() {}\n',
      "src/app/users.tsx": `${CORE}export async function loader() {}\nexport default function Users() {}\n`,
      "src/app/api/items+api.ts":
        'import { shared } from "../../lib/shared";\nexport function GET() {}\n',
      "src/app/+html.tsx": `${CORE}export default function Root() {}\n`,
      "src/app/+middleware.ts": `${CORE}export default function middleware() {}\n`,
      "src/lib/shared.ts": CORE,
      "src/lib/client.ts": CORE,
      "src/lib/orphan.ts": CORE,
    });
    const named = sidesOf({
      "package.json": manifest(EXPO),
      "app.json": JSON.stringify({
        expo: { plugins: [["expo-router", { root: "./src/routes" }]] },
      }),
      "src/routes/hello+api.ts": `${CORE}export function GET() {}\n`,
      "src/routes/index.tsx": `${CORE}export default function Home() {}\n`,
      "app/legacy.tsx": CORE,
    });

    expect(flags(app.sideOf("src/app/api/items+api.ts", 0))).toEqual([false, false, true]);
    expect(flags(app.sideOf("src/app/+html.tsx", 0))).toEqual([false, false, true]);
    expect(flags(app.sideOf("src/app/+middleware.ts", 0))).toEqual([false, false, true]);
    expect(flags(app.sideOf("src/app/users.tsx", 0))).toEqual([false, true, true]);
    expect(flags(app.sideOf("src/lib/shared.ts", 0))).toEqual([true, true, true]);
    expect(flags(app.sideOf("src/lib/client.ts", 0))).toEqual([true, true, false]);
    expect(flags(app.sideOf("src/lib/orphan.ts", 0))).toEqual([false, false, false]);
    expect(flags(named.sideOf("src/routes/hello+api.ts", 0))).toEqual([false, false, true]);
    expect(flags(named.sideOf("src/routes/index.tsx", 0))).toEqual([true, true, false]);
    expect(flags(named.sideOf("app/legacy.tsx", 0))).toEqual([false, false, false]);
  });

  it("gives a SolidStart API route, which exports no page, to the server", () => {
    const sides = sidesOf({
      "package.json": manifest({ dependencies: { "@solidjs/start": "2.0.0" } }),
      "src/routes/api/users.ts":
        'import { caller } from "../../lib/api";\nexport function GET() {}\n',
      "src/routes/index.tsx":
        'import { shared } from "../lib/shared";\nexport default function Home() {}\n',
      "src/lib/api.ts": CORE,
      "src/lib/shared.ts": CORE,
    });

    expect(flags(sides.sideOf("src/routes/api/users.ts", 0))).toEqual([false, false, true]);
    expect(flags(sides.sideOf("src/lib/api.ts", 0))).toEqual([false, false, true]);
    expect(flags(sides.sideOf("src/lib/shared.ts", 0))).toEqual([false, true, true]);
  });

  it("starts a page built with Vite beside a server from its index.html, and gives the server what no page reaches", () => {
    const html = (src: string) =>
      `<!doctype html>\n<div id="root"></div>\n<script type="module" src="${src}"></script>\n`;
    const express = sidesOf({
      "package.json": manifest({
        dependencies: { express: "5.0.0", react: "19.0.0", vite: "7.0.0" },
      }),
      "index.html": html("/src/main.tsx"),
      "src/main.tsx": 'import { App } from "./App";\n',
      "src/App.tsx": `import { caller } from "./api";\n${CORE}`,
      "src/api.ts": CORE,
      "src/App.test.tsx": 'import { App } from "./App";\n',
      "server/index.ts": 'import { caller } from "../src/server-api";\n',
      "src/server-api.ts": CORE,
    });
    const worker = sidesOf({
      "package.json": manifest({
        dependencies: { hono: "4.0.0", react: "19.0.0" },
        devDependencies: { vite: "7.0.0" },
      }),
      "index.html": html("/src/react-app/main.tsx"),
      "src/react-app/main.tsx": 'import { App } from "./App";\n',
      "src/react-app/App.tsx": CORE,
      "src/worker/index.ts": 'import { caller } from "./caller";\n',
      "src/worker/caller.ts": CORE,
    });
    const vue = sidesOf({
      "package.json": manifest({ dependencies: { fastify: "5.0.0", vue: "3.5.0", vite: "7.0.0" } }),
      "index.html": '<script src="/src/main.ts" type="module"></script>\n',
      "src/main.ts": 'import App from "./App.vue";\n',
      "src/App.vue": `<script setup lang="ts">\n${CORE}</script>\n`,
      "server.ts": 'import { caller } from "./src/server/caller";\n',
      "src/server/caller.ts": CORE,
    });
    const ssr = sidesOf({
      "package.json": manifest({
        dependencies: { express: "5.0.0", react: "19.0.0", vite: "7.0.0" },
      }),
      "index.html": html("/src/entry-client.tsx"),
      "src/entry-client.tsx": 'import { App } from "./App";\n',
      "src/entry-server.tsx": 'import { App } from "./App";\n',
      "src/App.tsx": CORE,
      "server.js": 'await vite.ssrLoadModule("/src/entry-server.tsx");\n',
    });
    const tools = sidesOf({
      "package.json": manifest({
        dependencies: { react: "19.0.0", vite: "7.0.0" },
        devDependencies: { hono: "4.0.0" },
      }),
      "src/App.tsx": CORE,
    });

    expect(flags(express.sideOf("src/App.tsx", 0))).toEqual([true, true, false]);
    expect(flags(express.sideOf("src/api.ts", 0))).toEqual([true, true, false]);
    expect(flags(express.sideOf("server/index.ts", 0))).toEqual([false, false, true]);
    expect(flags(express.sideOf("src/server-api.ts", 0))).toEqual([false, false, true]);
    expect(flags(express.sideOf("src/App.test.tsx", 0))).toEqual([false, false, false]);
    expect(flags(worker.sideOf("src/react-app/App.tsx", 0))).toEqual([true, true, false]);
    expect(flags(worker.sideOf("src/worker/caller.ts", 0))).toEqual([false, false, true]);
    expect(flags(vue.sideOf("src/App.vue", 0))).toEqual([true, true, false]);
    expect(flags(vue.sideOf("src/server/caller.ts", 0))).toEqual([false, false, true]);
    expect(flags(ssr.sideOf("src/App.tsx", 0))).toEqual([true, true, true]);
    expect(flags(ssr.sideOf("src/entry-server.tsx", 0))).toEqual([false, false, true]);
    expect(flags(tools.sideOf("src/App.tsx", 0))).toEqual([true, true, false]);
  });

  it("reads a Nuxt app's layers, under layers/ and those its config extends, by Nuxt's rules", () => {
    const app = sidesOf({
      "package.json": manifest({ dependencies: { nuxt: "4.0.0" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({});\n",
      "layers/base/nuxt.config.ts": "export default defineNuxtConfig({});\n",
      "layers/base/app/components/Users.vue": `<script setup lang="ts">\n${CORE}</script>\n`,
      "layers/base/server/api/users.ts": CORE,
      "layers/base/shared/api.ts": CORE,
      "layers/notes/app/components/Note.vue": `<script setup lang="ts">\n${CORE}</script>\n`,
    });
    const root = projectWith({
      "package.json": manifest({ name: "acme", private: true, workspaces: ["apps/*"] }),
      "apps/web/package.json": manifest({ name: "web", dependencies: { nuxt: "4.0.0" } }),
      "apps/web/nuxt.config.ts":
        'export default defineNuxtConfig({\n  extends: ["../../layers/brand", ["github:acme/theme", { auth: "x" }]],\n});\n',
      "layers/brand/nuxt.config.ts":
        'export default defineNuxtConfig({ extends: ["../tokens"] });\n',
      "layers/brand/app/composables/useApi.ts": CORE,
      "layers/brand/server/utils/caller.ts": CORE,
      "layers/tokens/app/utils/format.ts": CORE,
    });
    const mono = projectSides(workspaceOf(root), projectCode(root));

    expect(flags(app.sideOf("layers/base/app/components/Users.vue", 0))).toEqual([
      true,
      true,
      false,
    ]);
    expect(flags(app.sideOf("layers/base/server/api/users.ts", 0))).toEqual([false, false, true]);
    expect(flags(app.sideOf("layers/base/shared/api.ts", 0))).toEqual([true, true, true]);
    /* A folder of layers/ with no config of its own is no layer. */
    expect(flags(app.sideOf("layers/notes/app/components/Note.vue", 0))).toEqual([
      false,
      false,
      false,
    ]);
    expect(flags(mono.sideOf("layers/brand/app/composables/useApi.ts", 0))).toEqual([
      true,
      true,
      false,
    ]);
    expect(flags(mono.sideOf("layers/brand/server/utils/caller.ts", 0))).toEqual([
      false,
      false,
      true,
    ]);
    expect(flags(mono.sideOf("layers/tokens/app/utils/format.ts", 0))).toEqual([true, true, false]);
  });

  it("follows a package.json import to every file its conditions give", () => {
    const sides = sidesOf({
      "package.json": manifest({
        dependencies: { next: "16.0.0" },
        imports: { "#db": { node: "./lib/db.node.ts", default: "./lib/db.ts" } },
      }),
      "app/api/route.ts": 'import { db } from "#db";\nexport function GET() {}\n',
      "lib/db.node.ts": CORE,
      "lib/db.ts": CORE,
    });

    expect(flags(sides.sideOf("lib/db.node.ts", 0))).toEqual([false, false, true]);
    expect(flags(sides.sideOf("lib/db.ts", 0))).toEqual([false, false, true]);
  });

  it("follows a package.json import for certain by the first condition each side takes, as a package's exports", () => {
    const sides = sidesOf({
      "package.json": manifest({
        dependencies: { next: "16.0.0" },
        imports: {
          "#api": { browser: "./lib/api.browser.ts", default: "./lib/api.server.ts" },
          "#ui": { browser: "ui-kit", default: "./lib/ui.ts" },
        },
      }),
      "app/panel.tsx": '"use client";\nimport { api } from "#api";\nimport { ui } from "#ui";\n',
      "lib/api.browser.ts": CORE,
      "lib/api.server.ts": CORE,
      "lib/ui.ts": CORE,
    });

    expect(flags(sides.sideOf("lib/api.browser.ts", 0))).toEqual([true, true, false]);
    expect(flags(sides.sideOf("lib/api.server.ts", 0))).toEqual([false, true, false]);
    expect(flags(sides.sideOf("lib/ui.ts", 0))).toEqual([false, true, false]);
  });

  it("starts a page Vite builds beside a server from its entries, whatever its framework, and tells no side where they are not read", () => {
    const html = (src: string) => `<!doctype html>\n<script type="module" src="${src}"></script>\n`;
    const BESIDE = {
      dependencies: { express: "5.0.0", preact: "10.27.0" },
      devDependencies: { vite: "7.0.0" },
    };
    const preact = sidesOf({
      "package.json": manifest(BESIDE),
      "index.html": html("/src/main.tsx"),
      "src/main.tsx": 'import { App } from "./App";\nimport { shared } from "./lib/shared";\n',
      "src/App.tsx": CORE,
      "src/lib/shared.ts": CORE,
      "server/index.ts":
        'import { shared } from "../src/lib/shared";\nimport { caller } from "./caller";\n',
      "server/caller.ts": CORE,
    });
    const plain = sidesOf({
      "package.json": manifest({
        dependencies: { koa: "3.0.0" },
        devDependencies: { vite: "7.0.0" },
      }),
      "index.html": html("/src/main.ts"),
      "src/main.ts": 'import { api } from "./api";\n',
      "src/api.ts": CORE,
      "server/app.ts": CORE,
    });
    const configured = sidesOf({
      "package.json": manifest({
        dependencies: { express: "5.0.0", lit: "3.3.0" },
        devDependencies: { vite: "7.0.0" },
      }),
      "vite.config.ts":
        'import { defineConfig } from "vite";\n\nexport default defineConfig({\n  root: "web",\n  build: { rollupOptions: { input: { main: "./index.html", admin: "./admin.html" } } },\n});\n',
      "web/index.html": html("/main.ts"),
      "web/admin.html": html("./admin.ts"),
      "web/main.ts": CORE,
      "web/admin.ts": CORE,
      "server.ts": CORE,
    });
    const spread = sidesOf({
      "package.json": manifest(BESIDE),
      "vite.config.ts":
        'import base from "./vite.base";\n\nexport default { ...base, plugins: [] };\n',
      "src/main.tsx": CORE,
      "server/index.ts": CORE,
    });
    const computed = sidesOf({
      "package.json": manifest(BESIDE),
      "vite.config.ts":
        'import { resolve } from "node:path";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({ build: { rollupOptions: { input: resolve(process.cwd(), "index.html") } } });\n',
      "index.html": html("/src/main.tsx"),
      "src/main.tsx": CORE,
      "server/index.ts": CORE,
    });

    expect(flags(preact.sideOf("src/App.tsx", 0))).toEqual([true, true, false]);
    expect(flags(preact.sideOf("src/lib/shared.ts", 0))).toEqual([true, true, true]);
    expect(flags(preact.sideOf("server/caller.ts", 0))).toEqual([false, false, true]);
    expect(flags(plain.sideOf("src/api.ts", 0))).toEqual([true, true, false]);
    expect(flags(plain.sideOf("server/app.ts", 0))).toEqual([false, false, true]);
    expect(flags(configured.sideOf("web/main.ts", 0))).toEqual([true, true, false]);
    expect(flags(configured.sideOf("web/admin.ts", 0))).toEqual([true, true, false]);
    expect(flags(configured.sideOf("server.ts", 0))).toEqual([false, false, true]);
    const inline = sidesOf({
      "package.json": manifest(BESIDE),
      "index.html": '<script type="module">\nimport "./src/main.tsx";\n</script>\n',
      "src/main.tsx": CORE,
      "server/index.ts": CORE,
    });
    for (const sides of [spread, computed, inline])
      for (const file of ["src/main.tsx", "server/index.ts"])
        expect(flags(sides.sideOf(file, 0))).toEqual([false, false, false]);
    expect(inline.notes()).toEqual([
      {
        file: "index.html",
        what: expect.stringMatching(/^Not read: it holds a module script written in the page/),
      },
    ]);
    expect(spread.notes()).toEqual([
      {
        file: "vite.config.ts",
        what: expect.stringMatching(/^Not read: its default export is not data/),
      },
    ]);
    expect(computed.notes()).toEqual([
      {
        file: "vite.config.ts",
        what: expect.stringMatching(/^Not read: its build\.rollupOptions\.input is not data/),
      },
    ]);
  });

  it("reads a Vite config's input and root written as a path from its own folder: resolve(), join(), fileURLToPath()", () => {
    const html = (src: string) => `<script type="module" src="${src}"></script>\n`;
    const cases: Array<[string, string, string]> = [
      [
        "vite.config.ts",
        'import { resolve } from "node:path";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({ build: { rollupOptions: { input: resolve(__dirname, "index.html") } } });\n',
        "",
      ],
      [
        "vite.config.ts",
        'import path from "path";\n\nexport default {\n  build: {\n    rollupOptions: {\n      input: { main: path.resolve(__dirname, "index.html"), admin: path.resolve(__dirname, "pages/admin/index.html") },\n    },\n  },\n};\n',
        "",
      ],
      [
        "vite.config.mjs",
        'import { fileURLToPath } from "node:url";\n\nexport default { build: { rolldownOptions: { input: fileURLToPath(new URL("./index.html", import.meta.url)) } } };\n',
        "",
      ],
      [
        "vite.config.ts",
        'import * as path from "node:path";\n\nexport default { root: path.join(import.meta.dirname, "web") };\n',
        "web/",
      ],
      [
        "vite.config.cjs",
        'const { join } = require("path");\n\nmodule.exports = { root: join(__dirname, "client") };\n',
        "client/",
      ],
    ];
    for (const [file, config, root] of cases) {
      const sides = sidesOf({
        "package.json": manifest({
          dependencies: { express: "5.0.0", lit: "3.3.0" },
          devDependencies: { vite: "7.0.0" },
        }),
        [file]: config,
        [`${root}index.html`]: html("./main.ts"),
        [`${root}main.ts`]: CORE,
        "pages/admin/index.html": html("./admin.ts"),
        "pages/admin/admin.ts": CORE,
        "server.ts": CORE,
      });

      expect(flags(sides.sideOf(`${root}main.ts`, 0))).toEqual([true, true, false]);
      expect(flags(sides.sideOf("server.ts", 0))).toEqual([false, false, true]);
      expect(sides.notes()).toEqual([]);
      if (config.includes("pages/admin"))
        expect(flags(sides.sideOf("pages/admin/admin.ts", 0))).toEqual([true, true, false]);
    }
  });

  it("reads a package with no Vite entry and no page as its server's alone: vite among a server's tools", () => {
    const tools = (files: Record<string, string>) =>
      sidesOf({
        "package.json": manifest({
          dependencies: { fastify: "5.0.0" },
          devDependencies: { vite: "7.0.0", vitest: "4.0.0" },
        }),
        "src/server.ts": 'import { routes } from "./routes";\n',
        "src/routes.ts": CORE,
        ...files,
      });
    const bare = tools({});
    const configured = tools({
      "vite.config.ts":
        'import { defineConfig } from "vite";\n\nexport default defineConfig({ test: {} });\n',
    });

    for (const sides of [bare, configured])
      for (const file of ["src/server.ts", "src/routes.ts"])
        expect(flags(sides.sideOf(file, 0))).toEqual([false, false, true]);
    expect([...bare.notes(), ...configured.notes()]).toEqual([]);
  });

  it("tells no side of a page beside a server that a bundler other than Vite builds, vite only for its tests or not", () => {
    const shop = (
      dependencies: Record<string, string>,
      tools: Record<string, string>,
      files = {},
    ) =>
      sidesOf({
        "package.json": manifest({
          dependencies: { express: "5.0.0", "react-dom": "19.0.0", ...dependencies },
          devDependencies: { webpack: "5.100.0", ...tools },
        }),
        "webpack.config.js": 'module.exports = { entry: "./src/main.tsx" };\n',
        "src/main.tsx": `import { App } from "./App";\n${CORE}`,
        "src/App.tsx": CORE,
        "server/index.ts": CORE,
        ...files,
      });
    const react = { react: "19.0.0" };
    const packages = [
      shop(react, {}),
      shop(react, { vite: "7.0.0", vitest: "4.0.0" }),
      shop(react, { vitest: "4.0.0" }),
      shop(
        react,
        { vite: "7.0.0", vitest: "4.0.0" },
        { "vitest.config.ts": "export default {};\n" },
      ),
      shop({ preact: "10.27.0" }, { vite: "7.0.0" }),
    ];

    for (const sides of packages) {
      for (const file of ["src/main.tsx", "src/App.tsx", "server/index.ts"])
        expect(flags(sides.sideOf(file, 0))).toEqual([false, false, false]);
      expect(sides.notes()).toEqual([
        {
          file: "package.json",
          what: expect.stringMatching(
            /^Not read: it lists p?react, and Vite has no entry here: a page another bundler builds with it and a server that renders HTML with it alone look alike to Courier, so no file of the package is told a side$/,
          ),
        },
      ]);
    }
    expect(packages.at(-1)?.notes()[0]?.what).toContain("it lists preact");
  });

  it("keeps a tool's config off either side: what Vite's config names by new URL() is no side's", () => {
    const config = (line: string) =>
      `import { fileURLToPath, URL } from "node:url";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({ ${line} });\n`;
    const ALIAS = 'resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } }';
    const shop = (files: Record<string, string>) =>
      sidesOf({
        "package.json": manifest({
          dependencies: { express: "5.0.0", react: "19.0.0", "react-dom": "19.0.0" },
          devDependencies: { vite: "7.0.0" },
        }),
        "src/App.tsx": CORE,
        "server/index.ts": CORE,
        ...files,
      });
    const input = shop({
      "vite.config.ts": config(
        'build: { rollupOptions: { input: fileURLToPath(new URL("./src/main.tsx", import.meta.url)) } }',
      ),
      "src/main.tsx": `import { App } from "./App";\n${CORE}`,
    });
    const aliased = shop({
      "vite.config.ts": config(ALIAS),
      "index.html": '<script type="module" src="/src/index.tsx"></script>\n',
      "src/index.tsx": `import { App } from "./App";\n${CORE}`,
    });
    const orphan = shop({
      "vite.config.ts": config(ALIAS),
      "index.html": '<script type="module" src="/src/main.tsx"></script>\n',
      "src/main.tsx": `import { App } from "./App";\n${CORE}`,
      "src/index.ts": CORE,
    });

    for (const file of ["src/main.tsx", "src/App.tsx"])
      expect(flags(input.sideOf(file, 0))).toEqual([true, true, false]);
    for (const file of ["src/index.tsx", "src/App.tsx"])
      expect(flags(aliased.sideOf(file, 0))).toEqual([true, true, false]);
    for (const sides of [input, aliased])
      expect(flags(sides.sideOf("vite.config.ts", 0))).toEqual([false, false, false]);
    expect(orphan.sideOf("src/index.ts", 0)).toMatchObject({
      page: false,
      maybeServer: true,
      serverVia: { root: "src/index.ts" },
    });
  });

  it("gives every file of a server framework to the server", () => {
    const sides = sidesOf({
      "package.json": manifest({ dependencies: { express: "5.0.0" } }),
      "src/server.ts": 'import { caller } from "./courier/caller.js";\n',
      "src/courier/caller.ts": CORE,
    });

    expect(flags(sides.sideOf("src/server.ts", 0))).toEqual([false, false, true]);
    expect(flags(sides.sideOf("src/courier/caller.ts", 0))).toEqual([false, false, true]);
  });

  it("follows a workspace's packages by name, and names a package whose framework it does not know", () => {
    const sides = sidesOf({
      "package.json": manifest({
        name: "acme",
        private: true,
        workspaces: ["apps/*", "packages/*"],
      }),
      "apps/web/package.json": manifest({ name: "web", dependencies: { next: "16.0.0" } }),
      "apps/web/app/panel.tsx": `"use client";\nimport { shared } from "@acme/shared";\n`,
      "apps/api/package.json": manifest({ name: "api", dependencies: { express: "5.0.0" } }),
      "apps/api/src/server.ts": 'import { shared } from "@acme/shared/api";\n',
      "packages/shared/package.json": manifest({ name: "@acme/shared" }),
      "packages/shared/src/api.ts": CORE,
      "packages/lonely/package.json": manifest({ name: "@acme/lonely" }),
      "packages/lonely/src/index.ts": CORE,
    });

    expect(flags(sides.sideOf("packages/shared/src/api.ts", 0))).toEqual([false, true, true]);
    expect(sides.sideOf("packages/lonely/src/index.ts", 0)).toMatchObject({
      maybePage: false,
      maybeServer: false,
      framework: undefined,
    });
  });

  it("follows a workspace's package by name to the file its exports give each side, and takes in a package whose entry is its build's once", () => {
    const sides = sidesOf({
      "package.json": manifest({
        name: "acme",
        private: true,
        workspaces: ["apps/*", "packages/*"],
      }),
      "apps/web/package.json": manifest({ name: "web", dependencies: { next: "16.0.0" } }),
      "apps/web/app/panel.tsx": `"use client";\nimport { api } from "@acme/api";\nimport { Button } from "@acme/api/ui/button";\nimport { kit } from "@acme/kit";\n`,
      "apps/web/app/page.tsx":
        'import { api } from "@acme/api";\nexport default function Page() {}\n',
      "packages/api/package.json": manifest({
        name: "@acme/api",
        exports: {
          ".": { node: "./src/server.ts", default: "./src/browser.ts" },
          "./ui/*": "./src/ui/*.tsx",
        },
      }),
      "packages/api/src/server.ts": CORE,
      "packages/api/src/browser.ts": CORE,
      "packages/api/src/ui/button.tsx": CORE,
      "packages/api/src/other.ts": CORE,
      "packages/kit/package.json": manifest({ name: "@acme/kit", main: "./dist/index.js" }),
      "packages/kit/src/index.ts": CORE,
    });

    expect(flags(sides.sideOf("packages/api/src/server.ts", 0))).toEqual([false, false, true]);
    expect(flags(sides.sideOf("packages/api/src/browser.ts", 0))).toEqual([true, true, true]);
    expect(flags(sides.sideOf("packages/api/src/ui/button.tsx", 0))).toEqual([true, true, false]);
    expect(flags(sides.sideOf("packages/api/src/other.ts", 0))).toEqual([false, false, false]);
    expect(sides.sideOf("packages/kit/src/index.ts", 0)).toMatchObject({
      page: false,
      maybePage: true,
      maybeServer: false,
      pageThrough: "@acme/kit",
    });
  });

  it("takes what a file too large to read may load for maybe the side that reaches it, and nothing for one no side reaches", () => {
    const LARGE = `// ${"x".repeat(UPGRADE_LIMITS.sourceBytes)}\n`;
    const sides = sidesOf({
      "package.json": manifest({ dependencies: { next: "16.0.0" } }),
      "app/panel.tsx": `"use client";\nimport { schema } from "../lib/schema";\n`,
      "app/api/route.ts": 'import { caller } from "../../lib/api";\nexport function GET() {}\n',
      "lib/schema.ts": `export const schema = 1;\n${LARGE}`,
      "lib/api.ts": CORE,
      "lib/orphan.ts": CORE,
    });
    const quiet = sidesOf({
      "package.json": manifest({ dependencies: { next: "16.0.0" } }),
      "app/page.tsx": 'import { Chart } from "./chart";\nexport default function Page() {}\n',
      "app/chart.tsx": `"use client";\n${LARGE}`,
      "app/api/route.ts": 'import { caller } from "../../lib/api";\nexport function GET() {}\n',
      "lib/data.ts": `export const rows = [];\n${LARGE}`,
      "lib/api.ts": CORE,
      "lib/orphan.ts": CORE,
    });

    expect(sides.sideOf("lib/api.ts", 0)).toMatchObject({
      page: false,
      maybePage: true,
      maybeServer: true,
    });
    expect(sides.sideOf("lib/orphan.ts", 0)).toMatchObject({
      page: false,
      maybePage: true,
      maybeServer: false,
      incomplete: true,
    });
    /* The page loads the large client component, which may load anything; the server only renders it. */
    expect(flags(quiet.sideOf("lib/api.ts", 0))).toEqual([false, true, true]);
    expect(quiet.sideOf("lib/orphan.ts", 0)).toMatchObject({
      maybePage: true,
      maybeServer: false,
    });
  });

  it("takes a file that does not parse as the root its path and directive make it", () => {
    const sides = sidesOf({
      "package.json": manifest({ dependencies: { next: "16.0.0" } }),
      "app/page.tsx": "import { ( from",
      "app/lost.ts": "import { ( from",
      "lib/api.ts": CORE,
    });

    expect(sides.sideOf("lib/api.ts", 0)).toMatchObject({
      page: false,
      maybePage: false,
      maybeServer: true,
      incomplete: true,
    });
  });

  it("reads a cycle of imports once, and a server's import of a name it makes up as of any file", () => {
    const sides = sidesOf({
      "package.json": manifest({ dependencies: { nuxt: "4.0.0" } }),
      "pages/index.vue": '<script setup lang="ts">\nimport { a } from "~/lib/a";\n</script>\n',
      "lib/a.ts": 'import { b } from "./b";\n',
      "lib/b.ts": `import { a } from "./a";\n${CORE}`,
      "server/api/run.ts": "export default async (name: string) => import(name);\n",
      "lib/c.ts": CORE,
    });

    expect(flags(sides.sideOf("lib/b.ts", 0))).toEqual([true, true, true]);
    expect(flags(sides.sideOf("lib/c.ts", 0))).toEqual([false, false, true]);
  });

  it("carries no page into a module of server functions a page imports, under Next.js and SolidStart", () => {
    const next = sidesOf({
      "package.json": manifest({ dependencies: { next: "16.0.0" } }),
      "app/form.tsx": `"use client";\nimport { save } from "./actions";\nimport { token } from "./token";\n`,
      "app/actions.ts": `"use server";\nimport { caller } from "../lib/api";\nexport async function save() {}\n`,
      "app/token.ts": `"use server";\n${CORE}export async function token() {}\n`,
      "lib/api.ts": CORE,
    });
    const solid = sidesOf({
      "package.json": manifest({ dependencies: { "@solidjs/start": "2.0.0" } }),
      "src/routes/index.tsx":
        'import { save } from "../lib/actions";\nexport default function Home() {}\n',
      "src/lib/actions.ts": `"use server";\n${CORE}export async function save() {}\n`,
    });
    const spa = sidesOf({
      "package.json": manifest({ dependencies: { vite: "7.0.0", react: "19.0.0" } }),
      "src/form.tsx": 'import { save } from "../lib/actions";\n',
      "lib/actions.ts": `"use server";\n${CORE}`,
    });

    expect(flags(next.sideOf("app/actions.ts", 0))).toEqual([false, false, true]);
    expect(flags(next.sideOf("app/token.ts", 0))).toEqual([false, false, true]);
    expect(flags(next.sideOf("lib/api.ts", 0))).toEqual([false, false, true]);
    expect(flags(solid.sideOf("src/lib/actions.ts", 0))).toEqual([false, false, true]);
    /* A framework that does not read the directive bundles the module as any other. */
    expect(flags(spa.sideOf("lib/actions.ts", 0))).toEqual([true, true, false]);
  });

  it("reads folders a build writes below a package's root, and React Router's .server folder", () => {
    const next = sidesOf({
      "package.json": manifest({ dependencies: { next: "16.0.0" } }),
      "app/build/page.tsx":
        'import { caller } from "../../lib/api";\nexport default function Page() {}\n',
      "app/coverage/route.ts":
        'import { caller } from "../../lib/api";\nexport function GET() {}\n',
      "app/panel.tsx": `"use client";\nimport { caller } from "../lib/api";\n`,
      "lib/api.ts": CORE,
    });
    const routes = sidesOf({
      "package.json": manifest({ dependencies: { "@react-router/dev": "7.0.0", react: "19.0.0" } }),
      "app/.server/caller.ts": CORE,
      "app/routes/home.tsx":
        'import { caller } from "../.server/caller";\nexport function loader() {}\n',
    });

    expect(flags(next.sideOf("lib/api.ts", 0))).toEqual([true, true, true]);
    expect(flags(routes.sideOf("app/.server/caller.ts", 0))).toEqual([false, false, true]);
  });

  it("follows an import through a linked folder to the file it is, and takes a package with a link out of the workspace for maybe either side", () => {
    const outside = projectWith({ "api.ts": CORE });
    const root = projectWith({
      "package.json": manifest({
        name: "acme",
        private: true,
        workspaces: ["apps/*", "packages/*"],
      }),
      "apps/web/package.json": manifest({ name: "web", dependencies: { next: "16.0.0" } }),
      "apps/web/app/api/route.ts":
        'import { caller } from "../../shared/api";\nexport function GET() {}\n',
      "apps/web/app/panel.tsx": `"use client";\nimport { caller } from "../shared/api";\n`,
      "apps/web/app/lib/local.ts": CORE,
      "packages/shared/package.json": manifest({ name: "@acme/shared" }),
      "packages/shared/src/api.ts": CORE,
    });
    symlinkSync(join(root, "packages/shared/src"), join(root, "apps/web/shared"), "junction");
    symlinkSync(outside, join(root, "apps/web/vendor"), "junction");
    const sides = projectSides(workspaceOf(root), projectCode(root));

    expect(flags(sides.sideOf("packages/shared/src/api.ts", 0))).toEqual([true, true, true]);
    expect(sides.sideOf("apps/web/app/lib/local.ts", 0)).toMatchObject({
      maybePage: true,
      maybeServer: true,
      incomplete: true,
    });
  });

  it("follows a long chain of imports to its end, with no stack to run out of", () => {
    const files: Record<string, string> = {
      "package.json": manifest({ dependencies: { vite: "7.0.0", react: "19.0.0" } }),
      "src/main.ts": 'import "../lib/link-0";\n',
    };
    for (let at = 0; at < 3000; at++)
      files[`lib/link-${at}.ts`] = at === 2999 ? CORE : `import "./link-${at + 1}";\n`;

    const sides = sidesOf(files);

    expect(flags(sides.sideOf("lib/link-2999.ts", 0))).toEqual([true, true, false]);
  });
});
