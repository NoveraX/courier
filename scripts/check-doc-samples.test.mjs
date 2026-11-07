/**
 * Self-test for `scripts/check-doc-samples.mjs`. The documentation showed
 * `defineMiddleware(async (ctx, next) => …)` for a year after the function
 * took a name, a phase and a handler, in pages that imported it and in
 * fragments that did not; nothing compiled a sample.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { jsxObjects, jsxText } from "../docs/src/site/content/jsx-literals.ts";
import { checkSamples } from "./check-doc-samples.mjs";
import { codeGroupSamples } from "./code-group-samples.mjs";
import { extractSamples, importHeader, samplePages } from "./doc-samples.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TS_TAB = /^(ts|tsx|typescript)$/;

describe("extractSamples", () => {
  it("takes every ts, tsx and typescript fence, from its first code line", () => {
    const page = [
      "# Page",
      "",
      '```ts title="a.ts"',
      "const a = 1",
      "```",
      "",
      "```bash",
      "npm test",
      "```",
      "",
      "```typescript",
      "const b = 2",
      "```",
    ].join("\n");

    expect(extractSamples(page)).toEqual([
      { line: 4, jsx: false, listing: false, code: "const a = 1\n", file: "a.ts" },
      { line: 12, jsx: false, listing: false, code: "const b = 2\n" },
    ]);
  });

  it("reads a fence indented inside a component without its indentation", () => {
    const page = ["<Tab>", "  ```tsx", "  const el = <p>hi</p>", "  ```", "</Tab>"].join("\n");

    expect(extractSamples(page)).toEqual([
      { line: 3, jsx: true, listing: false, code: "const el = <p>hi</p>\n" },
    ]);
  });

  it("marks a signature or type listing, which names the packages' own types", () => {
    const page = [
      '```ts title="signature"',
      "function retryMiddleware(): Middleware",
      "```",
      "",
      "```ts",
      "declare function createCaller(api: DefinedApi): TypedClient",
      "```",
    ].join("\n");

    expect(extractSamples(page).map((sample) => sample.listing)).toEqual([true, true]);
  });

  it("reads a ts fence that holds JSX as tsx", () => {
    const page = ["```ts", "const el = <Users />", "```"].join("\n");

    expect(extractSamples(page)[0]?.jsx).toBe(true);
  });

  it("takes each TypeScript tab of tabbed code, on the line its code is written; a shell tab is none", () => {
    const page = [
      "# Page",
      "",
      "<CodeGroup",
      "  items={[",
      '    { label: "npm", code: "npm install express", language: "bash" },',
      '    { label: "Express", code: `// server.ts\\nimport express from "express"\\n`, language: "ts" },',
      '    { label: "Hono", code: "const app = 1\\n" },',
      "  ]}",
      "/>",
    ].join("\n");

    expect(extractSamples(page)).toEqual([
      {
        line: 6,
        jsx: false,
        listing: false,
        flat: true,
        code: '// server.ts\nimport express from "express"\n',
        file: "server.ts",
      },
      { line: 7, jsx: false, listing: false, flat: true, code: "const app = 1\n" },
    ]);
  });

  it("takes each file of a sample that shows two, under the comments naming them, as a sample of its own", () => {
    const page = [
      '```ts title="server/plugins/courier.ts"',
      "export default 1",
      "",
      "// server/api/request.ts",
      "export default 2",
      "```",
    ].join("\n");

    expect(extractSamples(page)).toEqual([
      {
        line: 2,
        jsx: false,
        listing: false,
        code: "export default 1\n",
        file: "server/plugins/courier.ts",
      },
      {
        line: 4,
        jsx: false,
        listing: false,
        code: "// server/api/request.ts\nexport default 2\n",
        file: "server/api/request.ts",
      },
    ]);
  });

  it("reads no tabbed code that a fence shows as code", () => {
    const page = [
      "```tsx",
      '<CodeGroup items={[{ label: "a", code: "const a: number = 1" }]} />',
      "```",
    ].join("\n");

    expect(extractSamples(page)).toHaveLength(1);
  });
});

describe("the docs' tabbed code", () => {
  it("is read alike here and by the site's Markdown, every TypeScript tab with its code", () => {
    const pages = samplePages(ROOT).filter((page) => page.endsWith(".mdx"));
    let tabs = 0;
    for (const page of pages) {
      const text = readFileSync(page, "utf8");
      if (!text.includes("<CodeGroup")) continue;
      const read = codeGroupSamples(text).map((sample) => sample.code);
      const site = text
        .split("<CodeGroup")
        .slice(1)
        .flatMap((group) => jsxObjects(group, "items"))
        .filter((item) => TS_TAB.test(jsxText(item, "language") ?? "ts"))
        .map((item) => jsxText(item, "code"));
      expect(read, page).toEqual(site);
      tabs += read.length;
    }
    expect(tabs).toBeGreaterThan(0);
  });
});

describe("importHeader", () => {
  it("imports each package name once, from the entry that exports it, and nothing else", () => {
    const exported = new Map([
      ["defineApi", "@noverax/courier/define"],
      ["courier", "@noverax/courier/define"],
      ["createCaller", "@noverax/courier"],
    ]);

    const header = importHeader(
      ["defineApi", "users", "createCaller", "defineApi", "courier"],
      exported,
    );

    expect(header).toEqual([
      'import { defineApi, courier } from "@noverax/courier/define";',
      'import { createCaller } from "@noverax/courier";',
    ]);
  });
});

describe("checkSamples", () => {
  let problems = [];

  beforeAll(() => {
    problems = checkSamples([
      {
        page: "removed-form.mdx",
        line: 10,
        jsx: false,
        code: [
          'import { defineMiddleware } from "@noverax/courier/middleware"',
          "",
          "const timing = defineMiddleware(async (ctx, next) => next())",
          "",
        ].join("\n"),
      },
      {
        page: "fragment.mdx",
        line: 20,
        jsx: false,
        code: "const timing = defineMiddleware(async (ctx, next) => next())\n",
      },
      {
        page: "current-form.mdx",
        line: 30,
        jsx: false,
        code: 'const timing = defineMiddleware("timing", "wrap", async (_ctx, next) => next())\n',
      },
      {
        page: "not-exported.mdx",
        line: 40,
        jsx: false,
        code: 'import type { MiddlewareFn } from "@noverax/courier/middleware"\n',
      },
      {
        page: "listing.mdx",
        line: 60,
        jsx: false,
        listing: true,
        code: "declare function retryMiddleware(): MiddlewareFn\n",
      },
      {
        page: "left-out.mdx",
        line: 50,
        jsx: false,
        code: 'import { caller } from "@/lib/caller"\n\nconst users = await caller.users.getAll({ page })\n',
      },
      {
        page: "shown-file.mdx",
        line: 70,
        jsx: false,
        file: "api/sources.ts",
        code: [
          'import { courier, defineApi } from "@noverax/courier/define"',
          "const { endpoint } = courier()",
          'export const api = defineApi({ baseURL: "https://api.example.com", endpoints: {',
          '  getUser: endpoint.get("users/:id").variables<{ id: string }>(),',
          "} })",
          "",
        ].join("\n"),
      },
      {
        page: "shown-file.mdx",
        line: 80,
        jsx: false,
        code: [
          'import { createCaller } from "@noverax/courier"',
          'import { api } from "@/api/sources"',
          'await createCaller(api).getUser({ userId: "1" })',
          "",
        ].join("\n"),
      },
      {
        page: "variant-file.mdx",
        line: 90,
        jsx: false,
        file: "api/index.ts",
        code: "export const api = { one: 1 }\n",
      },
      {
        page: "variant-file.mdx",
        line: 95,
        jsx: false,
        code: 'import { mainApi } from "@/api"\n\nmainApi.users.getAll()\n',
      },
      {
        page: "incomplete-file.mdx",
        line: 100,
        jsx: false,
        file: "lib/q.ts",
        code: 'import { q as shown } from "@/lib/elsewhere"\n\nexport const q = shown\n',
      },
      {
        page: "incomplete-file.mdx",
        line: 105,
        jsx: false,
        code: 'import { q } from "@/lib/q"\n\nq.users.useQuery("anything")\n',
      },
      {
        page: "next-config.mdx",
        line: 110,
        jsx: false,
        code: 'import type { NextConfig } from "next"\n\nexport const config: NextConfig = {}\n',
      },
      {
        page: "vite-env.mdx",
        line: 115,
        jsx: false,
        code: "export const proxy = import.meta.env.VITE_PROXY_URL\n",
      },
      {
        page: "plugin-routes.mdx",
        line: 120,
        jsx: false,
        code: [
          'import type config from "../courier.config"',
          "",
          'declare module "@noverax/courier/routes" {',
          "  interface Register {",
          "    config: typeof config",
          "  }",
          "}",
          "",
        ].join("\n"),
      },
      {
        page: "plugin-routes.mdx",
        line: 130,
        jsx: false,
        code: [
          'import { createProxyQueryCaller } from "@noverax/courier-react"',
          'import { routes } from "@noverax/courier/routes"',
          "",
          "const q = createProxyQueryCaller(routes.api)",
          'q.users.useMutation("create", { onSuccess: (user) => console.log(user.name) })',
          "",
        ].join("\n"),
      },
      {
        page: "plugin-routes.mdx",
        line: 140,
        jsx: false,
        code: "const caller = createProxyCaller(routes.api)\nconst user = await caller.users.getById({ id: 5 })\n",
      },
      {
        page: "frameworks/solid-start.mdx",
        line: 150,
        jsx: false,
        code: [
          'import { registerRequestContext } from "@noverax/courier/server"',
          'import { solidStartRequestContext } from "@noverax/courier-solid"',
          'import { getRequestEvent } from "solid-js/web"',
          "",
          "registerRequestContext(solidStartRequestContext(getRequestEvent))",
          "",
        ].join("\n"),
      },
      {
        page: "file-route.mdx",
        line: 160,
        jsx: false,
        code: [
          'import { createFileRoute } from "@tanstack/react-router"',
          'import { apiRoute } from "@noverax/courier-tanstack-start"',
          "",
          'export const Route = createFileRoute("/api/request")({ server: { handlers: apiRoute() } })',
          "",
        ].join("\n"),
      },
      {
        page: "wrong-handler.mdx",
        line: 170,
        jsx: false,
        code: [
          'import { createFileRoute } from "@tanstack/react-router"',
          "",
          'export const Route = createFileRoute("/api/request")({ server: { handlers: { GET: 42 } } })',
          "",
        ].join("\n"),
      },
      {
        page: "tabbed.mdx",
        line: 150,
        jsx: false,
        flat: true,
        code: [
          'import { defineMiddleware } from "@noverax/courier/middleware"',
          "",
          "const timing = defineMiddleware(async (ctx, next) => next())",
          "",
        ].join("\n"),
      },
    ]);
  }, 60_000);

  it("reports a problem in tabbed code at the line the tab is written on", () => {
    expect(problems).toContainEqual(expect.stringMatching(/^tabbed\.mdx:150 TS2554 /));
  });

  it("takes the routes Courier's plugin builds as the reader's config types them, which no sample shows", () => {
    expect(problems.filter((problem) => problem.startsWith("plugin-routes.mdx"))).toEqual([]);
  });

  it("leaves out what SolidStart's types add to the request event of solid-js, which it does not load", () => {
    expect(problems.filter((problem) => problem.startsWith("frameworks/solid-start.mdx"))).toEqual(
      [],
    );
  });

  it("names a file route's path as the reader's generated route tree does, and checks its handlers", () => {
    expect(problems.filter((problem) => problem.startsWith("file-route.mdx"))).toEqual([]);
    expect(problems).toContainEqual(expect.stringMatching(/^wrong-handler\.mdx:172 TS2322 /));
  });

  it("leaves out a Vite variable the reader declares, though a sample loaded Next.js's types", () => {
    expect(problems.filter((problem) => problem.startsWith("vite-env.mdx"))).toEqual([]);
  });

  it("reports a call form the package no longer has, at its line", () => {
    expect(problems).toContainEqual(expect.stringMatching(/^removed-form\.mdx:12 TS2554 /));
  });

  it("checks a fragment that uses a package function without importing it", () => {
    expect(problems).toContainEqual(expect.stringMatching(/^fragment\.mdx:20 TS2554 /));
  });

  it("reports a type the entry does not export", () => {
    expect(problems).toContainEqual(
      expect.stringMatching(/^not-exported\.mdx:40 TS(2305|2724) .*MiddlewareFn/),
    );
  });

  it("reports a type a listing names that no entry exports", () => {
    expect(problems).toContainEqual(
      expect.stringMatching(/^listing\.mdx:60 TS2304 .*MiddlewareFn/),
    );
  });

  it("passes a sample that uses the package as it is, and one that leaves the reader's code out", () => {
    const pages = problems.map((problem) => problem.split(":")[0]);

    expect(pages).not.toContain("current-form.mdx");
    expect(pages).not.toContain("left-out.mdx");
  });

  it("compiles a sample against a file its page shows, reporting a wrong call at its line", () => {
    expect(problems).toContainEqual(expect.stringMatching(/^shown-file\.mdx:82 TS2353 .*userId/));
  });

  it("leaves typed as anything a file the page shows another variant of, or builds on what it never shows", () => {
    const pages = problems.map((problem) => problem.split(":")[0]);

    expect(pages).not.toContain("variant-file.mdx");
    expect(pages).not.toContain("incomplete-file.mdx");
  });
});
