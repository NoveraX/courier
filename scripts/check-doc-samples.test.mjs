/**
 * Self-test for `scripts/check-doc-samples.mjs`. The documentation showed
 * `defineMiddleware(async (ctx, next) => …)` for a year after the function
 * took a name, a phase and a handler, in pages that imported it and in
 * fragments that did not; nothing compiled a sample.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { checkSamples } from "./check-doc-samples.mjs";
import { extractSamples, importHeader } from "./doc-samples.mjs";

describe("extractSamples", () => {
  it("takes every ts, tsx and typescript fence, from its first code line", () => {
    const page = [
      "# Page",
      "",
      "```ts title=\"a.ts\"",
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
});

describe("importHeader", () => {
  it("imports each package name once, from the entry that exports it, and nothing else", () => {
    const exported = new Map([
      ["defineApi", "@noverax/courier/define"],
      ["courier", "@noverax/courier/define"],
      ["createCaller", "@noverax/courier"],
    ]);

    const header = importHeader(["defineApi", "users", "createCaller", "defineApi", "courier"], exported);

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
    ]);
  }, 60_000);

  it("reports a call form the package no longer has, at its line", () => {
    expect(problems).toContainEqual(expect.stringMatching(/^removed-form\.mdx:12 TS2554 /));
  });

  it("checks a fragment that uses a package function without importing it", () => {
    expect(problems).toContainEqual(expect.stringMatching(/^fragment\.mdx:20 TS2554 /));
  });

  it("reports a type the entry does not export", () => {
    expect(problems).toContainEqual(expect.stringMatching(/^not-exported\.mdx:40 TS(2305|2724) .*MiddlewareFn/));
  });

  it("reports a type a listing names that no entry exports", () => {
    expect(problems).toContainEqual(expect.stringMatching(/^listing\.mdx:60 TS2304 .*MiddlewareFn/));
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
