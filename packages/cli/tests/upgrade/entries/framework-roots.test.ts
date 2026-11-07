import { describe, expect, it } from "vitest";

import {
  type PieceFacts,
  rendersOnly,
  rootsOf,
} from "../../../src/upgrade/entries/framework-roots";

const PAGE = { page: true, server: false, split: false };
const SERVER = { page: false, server: true, split: false };
const SPLIT = { page: false, server: false, split: true };
const BOTH = { page: true, server: true, split: false };
const NONE = { page: false, server: false, split: false };

function facts(path: string, extra: Partial<PieceFacts> = {}): PieceFacts {
  return {
    path,
    kind: "module",
    directive: undefined,
    exportsDefault: false,
    exports: [],
    ...extra,
  };
}

describe("the roots a framework's rules give", () => {
  it.each([
    ["next", facts("src/components/Panel.tsx", { directive: "use client" }), PAGE],
    ["next", facts("app/page.tsx", { exportsDefault: true }), SERVER],
    ["next", facts("src/app/users/[id]/layout.tsx", { exportsDefault: true }), SERVER],
    ["next", facts("app/api/users/route.ts"), SERVER],
    ["next", facts("src/middleware.ts"), SERVER],
    ["next", facts("proxy.ts"), SERVER],
    ["next", facts("instrumentation.ts"), SERVER],
    ["next", facts("app/actions.ts", { directive: "use server" }), SERVER],
    ["next", facts("pages/api/users.ts"), SERVER],
    ["next", facts("pages/_document.tsx"), SERVER],
    ["next", facts("pages/index.tsx", { exportsDefault: true }), SPLIT],
    ["next", facts("app/users/user-card.tsx"), NONE],
    ["next", facts("lib/api.ts"), NONE],
    ["nuxt", facts("pages/index.vue", { kind: "script" }), PAGE],
    ["nuxt", facts("app/components/Users.vue", { kind: "script" }), PAGE],
    ["nuxt", facts("composables/useApi.ts"), PAGE],
    ["nuxt", facts("plugins/courier.server.ts"), SERVER],
    ["nuxt", facts("server/api/users.ts"), SERVER],
    ["nuxt", facts("shared/api.ts"), BOTH],
    ["nuxt", facts("app.vue", { kind: "script" }), PAGE],
    ["sveltekit", facts("src/routes/+page.svelte", { kind: "script" }), PAGE],
    ["sveltekit", facts("src/routes/users/+page.ts"), PAGE],
    ["sveltekit", facts("src/routes/users/+page.server.ts"), SERVER],
    ["sveltekit", facts("src/routes/api/+server.ts"), SERVER],
    ["sveltekit", facts("src/hooks.server.ts"), SERVER],
    ["sveltekit", facts("src/hooks.ts"), BOTH],
    ["sveltekit", facts("src/lib/courier/caller.ts"), PAGE],
    ["sveltekit", facts("src/lib/server/db.ts"), SERVER],
    ["sveltekit", facts("src/lib/db.server.ts"), SERVER],
    ["astro", facts("src/pages/index.astro", { kind: "frontmatter" }), SERVER],
    ["astro", facts("src/pages/index.astro", { kind: "script" }), PAGE],
    ["astro", facts("src/pages/api/users.ts"), SERVER],
    ["astro", facts("src/middleware.ts"), SERVER],
    ["astro", facts("src/components/Counter.tsx"), PAGE],
    ["astro", facts("src/lib/api.ts"), NONE],
    ["react-router", facts("app/routes/home.tsx", { exportsDefault: true }), SPLIT],
    ["react-router", facts("app/root.tsx", { exportsDefault: true }), SPLIT],
    ["react-router", facts("app/routes/api.request.ts"), SERVER],
    ["react-router", facts("app/entry.server.tsx"), SERVER],
    ["react-router", facts("app/entry.client.tsx"), PAGE],
    ["react-router", facts("app/lib/db.server.ts"), SERVER],
    ["remix", facts("app/routes/_index.tsx", { exportsDefault: true }), SPLIT],
    ["solid-start", facts("src/routes/index.tsx", { exportsDefault: true }), SPLIT],
    ["solid-start", facts("src/routes/api/users.ts", { exports: ["GET", "POST"] }), SERVER],
    ["solid-start", facts("src/entry-server.tsx"), SERVER],
    ["solid-start", facts("src/lib/actions.ts", { directive: "use server" }), SERVER],
    ["expo", facts("app/(tabs)/index.tsx", { exportsDefault: true }), PAGE],
    ["expo", facts("app/api/users+api.ts"), SERVER],
    ["expo", facts("app/+html.tsx", { exportsDefault: true }), SERVER],
    ["expo", facts("app/+middleware.ts"), SERVER],
    [
      "expo",
      facts("app/users.tsx", { exportsDefault: true, exports: ["loader", "default"] }),
      SPLIT,
    ],
    ["expo", facts("app/+not-found.tsx", { exportsDefault: true }), PAGE],
    ["expo", facts("App.tsx", { exportsDefault: true }), PAGE],
    ["expo", facts("src/components/Button.tsx"), NONE],
    ["react", facts("src/App.tsx", { exportsDefault: true }), PAGE],
    ["vue", facts("src/App.vue", { kind: "script" }), PAGE],
    ["react", facts("vite.config.ts", { exportsDefault: true }), NONE],
    ["express", facts("src/server.ts"), SERVER],
    ["hono", facts("src/courier/routes.ts"), SERVER],
    ["fastify", facts("routes/users.ts"), SERVER],
    ["nestjs", facts("src/courier/courier.module.ts"), SERVER],
    ["react", facts("src/components/Panel.tsx", { directive: "use client" }), PAGE],
    ["express", facts("src/client.ts", { directive: "use client" }), SERVER],
    [undefined, facts("src/index.ts"), NONE],
  ] as const)("%s: %o", (framework, piece, roots) => {
    expect(rootsOf({ id: framework }, piece)).toEqual(roots);
  });

  it("reads Expo Router's routes from the folder it is given, and starts the app from package.json's main", () => {
    const framework = { id: "expo" as const, routes: "src/app", main: "src/entry" };

    expect(rootsOf(framework, facts("src/app/api/items+api.ts"))).toEqual(SERVER);
    expect(rootsOf(framework, facts("src/app/index.tsx", { exportsDefault: true }))).toEqual(PAGE);
    expect(rootsOf(framework, facts("app/index.tsx", { exportsDefault: true }))).toEqual(NONE);
    expect(rootsOf(framework, facts("src/entry.tsx"))).toEqual(PAGE);
    expect(rootsOf(framework, facts("src/app/index.tsx", { exports: undefined }))).toEqual(SPLIT);
  });

  it("starts a page built with Vite beside a server from its entries alone", () => {
    const framework = {
      id: "react" as const,
      withServer: true,
      pageEntries: new Set(["src/react-app/main.tsx"]),
    };

    expect(rootsOf(framework, facts("src/react-app/main.tsx"))).toEqual(PAGE);
    expect(rootsOf(framework, facts("src/react-app/App.tsx", { exportsDefault: true }))).toEqual(
      NONE,
    );
    expect(rootsOf(framework, facts("src/worker/index.ts"))).toEqual(NONE);
  });

  it("takes the route modules React Router's routes file names, wherever they are", () => {
    const framework = { id: "react-router" as const, routeModules: new Set(["pages/home"]) };

    expect(rootsOf(framework, facts("app/pages/home.tsx", { exportsDefault: true }))).toEqual(
      SPLIT,
    );
    expect(rootsOf(framework, facts("app/pages/card.tsx", { exportsDefault: true }))).toEqual(NONE);
  });
});

describe("the imports a server renders rather than runs", () => {
  it("are a Next.js client component's, and an Astro component's whose default alone a page's frontmatter takes", () => {
    const serverComponent = facts("app/page.tsx", { exportsDefault: true });
    const frontmatter = facts("src/pages/index.astro", { kind: "frontmatter" });
    const to = (path: string, directive: "use client" | undefined, defaultAlone: boolean) => ({
      path,
      directive,
      defaultAlone,
    });

    expect(rendersOnly("next", serverComponent, to("app/panel.tsx", "use client", false))).toBe(
      true,
    );
    expect(rendersOnly("next", serverComponent, to("lib/api.ts", undefined, true))).toBe(false);
    expect(
      rendersOnly("astro", frontmatter, to("src/components/Counter.tsx", undefined, true)),
    ).toBe(true);
    expect(
      rendersOnly("astro", frontmatter, to("src/components/Card.astro", undefined, true)),
    ).toBe(true);
    expect(
      rendersOnly("astro", frontmatter, to("src/components/Users.tsx", undefined, false)),
    ).toBe(false);
    expect(rendersOnly("astro", frontmatter, to("src/lib/api.ts", undefined, true))).toBe(false);
    expect(
      rendersOnly("express", facts("src/server.ts"), to("src/panel.tsx", "use client", true)),
    ).toBe(false);
  });
});
