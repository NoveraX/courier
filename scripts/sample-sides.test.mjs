/**
 * The sides the docs' samples name, held to the upgrade's own reading of a
 * file: the rules by which a framework gives a file to the server or to a
 * page, which `courier-cli upgrade` moves a project's imports by. A sample
 * whose file the upgrade has a word for names the side the upgrade gives
 * it; one the upgrade says nothing of is the sample's own to name.
 *
 * A guide's samples are files of the framework it is about, as are a
 * framework package's in its README, and a sample on any other page that
 * Next.js would give a side — a route handler, instrumentation, a module
 * that opens with a directive — is read by Next.js's rules, the app the
 * other guides show. A file of another package than the guide's, as the
 * frontend a server's guide pairs with, names that package's framework on
 * its fence: ```ts framework="vite".
 *
 * The upgrade reads a sample's file as it reads a project's own, the
 * directive it opens with, what it exports, what TanStack Start keeps of
 * it to one side. A sample is never left out unsaid: a framework the
 * upgrade does not know, a guide the test reads by no framework, a file
 * the upgrade cannot read are each refused, with the sample named.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import nodePath, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { rootsOf } from "../packages/cli/src/upgrade/entries/framework-roots.ts";
import { moduleRecord } from "../packages/cli/src/upgrade/entries/module-records.ts";
import { extractSamples, readSamplePages } from "./doc-samples.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FRAMEWORK_ROOTS = fileURLToPath(
  new URL("../packages/cli/src/upgrade/entries/framework-roots.ts", import.meta.url),
);

/* The framework each framework's guide is about, by its page, as the upgrade names it. */
const GUIDES = {
  astro: "astro",
  express: "express",
  fastify: "fastify",
  hono: "hono",
  nestjs: "nestjs",
  nextjs: "next",
  nuxt: "nuxt",
  react: "react",
  "react-native": "expo",
  remix: "remix",
  "solid-start": "solid-start",
  sveltekit: "sveltekit",
  "tanstack-start": "tanstack-start-react",
  vue: "vue",
};
/* The page of the frameworks that is a guide to none: read as any other page. */
const NO_GUIDE = new Set(["overview"]);
/* The framework each framework's package is for, by its folder, whose README's samples are its files. */
const PACKAGES = {
  astro: "astro",
  express: "express",
  fastify: "fastify",
  hono: "hono",
  nestjs: "nestjs",
  next: "next",
  nuxt: "nuxt",
  remix: "remix",
  solid: "solid-start",
  sveltekit: "sveltekit",
  "tanstack-start": "tanstack-start-react",
};

/* The frameworks the upgrade's rules know: those its type of a package's framework names. */
function knownFrameworks() {
  const program = ts.createProgram([FRAMEWORK_ROOTS], {
    noEmit: true,
    skipLibCheck: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
  });
  const alias = program
    .getSourceFile(FRAMEWORK_ROOTS)
    ?.statements.find(
      (statement) =>
        ts.isTypeAliasDeclaration(statement) && statement.name.text === "PackageFrameworkId",
    );
  const type = alias && program.getTypeChecker().getTypeAtLocation(alias.name);
  const members = (type?.types ?? []).filter((member) => member.isStringLiteral());
  return new Set(members.map((member) => member.value));
}
const KNOWN = knownFrameworks();

/* The side the upgrade's roots of a file make: the server's, a page's, or both, as a module the framework splits. */
function sideOf(roots) {
  if (roots.split || (roots.page && roots.server)) return "both";
  if (roots.page) return "page";
  return roots.server ? "server" : undefined;
}

/* Where the samples' files are written, for the upgrade to read each as it reads a project's own. */
const FILES = mkdtempSync(join(tmpdir(), "sample-sides-"));
afterAll(() => rmSync(FILES, { recursive: true, force: true }));
let written = 0;

/* What the upgrade reads of a sample's file: each piece of its code, or none where it cannot read it. */
function piecesOf(sample) {
  const root = join(FILES, String(written++));
  mkdirSync(dirname(join(root, sample.file)), { recursive: true });
  writeFileSync(join(root, sample.file), sample.code);
  const record = moduleRecord(root, sample.file);
  return "pieces" in record ? record.pieces : undefined;
}

/* The roots of a file under a framework: those of each of its pieces, as the upgrade gives them. */
function fileRoots(framework, path, pieces) {
  const roots = { page: false, server: false, split: false };
  for (const { kind, directive, exportsDefault, exports, startCode } of pieces) {
    const one = rootsOf(
      { id: framework },
      { path, kind, directive, exportsDefault, exports, startCode },
    );
    roots.page ||= one.page;
    roots.server ||= one.server;
    roots.split ||= one.split;
  }
  return roots;
}

/* Each sample of the pages the upgrade reads, with the side it names and the side the upgrade gives its file; and what keeps a sample from being read. */
function judge(pages) {
  const problems = [];
  const judged = pages.flatMap(({ page, text }) => {
    const guide = /docs\/frameworks\/([\w-]+)\.mdx$/.exec(page)?.[1];
    const readme = /^packages\/([\w-]+)\/README\.md$/.exec(page)?.[1];
    const ofPage =
      guide === undefined || NO_GUIDE.has(guide) ? (PACKAGES[readme] ?? "next") : GUIDES[guide];
    if (ofPage === undefined) {
      problems.push(`${page} is the guide to a framework the test names none for`);
      return [];
    }
    return extractSamples(text).flatMap((sample) => {
      const at = `${page}:${sample.line}`;
      const framework = sample.framework ?? ofPage;
      if (!KNOWN.has(framework)) {
        problems.push(`${at} framework="${framework}" names no framework the upgrade knows`);
        return [];
      }
      if (sample.file === undefined || sample.side === undefined) return [];
      const pieces = piecesOf(sample);
      if (pieces === undefined) {
        problems.push(`${at} the upgrade cannot read the file of a sample that names its side`);
        return [];
      }
      /* Off a framework's guide, only a file Next.js gives a side by its name or its directive is read. */
      const upgrade = sideOf(fileRoots(framework, sample.file, pieces));
      return upgrade === undefined ? [] : [{ at, framework, side: sample.side, upgrade }];
    });
  });
  return { judged, problems };
}

const docs = judge(readSamplePages(ROOT));

/* A page of one fence, as the guide named writes it. */
const guidePage = (guide, fence, code) => ({
  page: `docs/src/content/docs/frameworks/${guide}.mdx`,
  text: `\`\`\`ts ${fence}\n${code}\n\`\`\`\n`,
});

const apartOf = ({ judged }) =>
  judged
    .filter(({ side, upgrade }) => side !== upgrade)
    .map(
      ({ at, framework, side, upgrade }) => `${at} ${side}, the upgrade's ${framework}: ${upgrade}`,
    );

describe("a sample's side", () => {
  it("is the side the upgrade gives its file, wherever the upgrade reads the file", () => {
    expect(docs.problems).toEqual([]);
    expect(apartOf(docs)).toEqual([]);
  });

  it("is judged alike however the system names the pages, as Windows does too", () => {
    const named = judge(readSamplePages(ROOT, nodePath.win32));
    expect(named.problems).toEqual([]);
    expect(named.judged.map(({ at }) => at)).toEqual(docs.judged.map(({ at }) => at));
  });

  it("is held to the upgrade's reading in enough samples to say so", () => {
    expect(docs.judged.length).toBeGreaterThanOrEqual(50);
    expect(new Set(docs.judged.map(({ framework }) => framework)).size).toBeGreaterThanOrEqual(12);
    expect(docs.judged.some(({ framework }) => framework === "tanstack-start-react")).toBe(true);
  });

  it("is read by frameworks the upgrade knows, each guide's among them", () => {
    expect([...KNOWN]).toEqual(expect.arrayContaining(["next", "express", "vite", "expo"]));
    const named = [...Object.values(GUIDES), ...Object.values(PACKAGES)];
    expect(named.filter((framework) => !KNOWN.has(framework))).toEqual([]);
  });

  it("is refused a framework the upgrade does not know, with the sample named", () => {
    const vite = 'title="src/lib/caller.ts" side="page" framework="vte"';
    const { problems } = judge([guidePage("express", vite, "export const caller = 1")]);
    expect(problems).toEqual([
      'docs/src/content/docs/frameworks/express.mdx:2 framework="vte" names no framework the upgrade knows',
    ]);
  });

  it("is read on a framework's guide only by a framework the test names for it", () => {
    const { problems } = judge([guidePage("angular", 'title="src/main.ts" side="page"', "")]);
    expect(problems).toEqual([
      "docs/src/content/docs/frameworks/angular.mdx is the guide to a framework the test names none for",
    ]);
  });

  it("is a framework package's rule in its README", () => {
    const readme = {
      page: "packages/tanstack-start/README.md",
      text: '```ts side="page"\n// src/server.ts\nexport {}\n```\n',
    };
    expect(apartOf(judge([readme]))).toEqual([
      "packages/tanstack-start/README.md:2 page, the upgrade's tanstack-start-react: server",
    ]);
  });

  it("is TanStack Start's rule on its guide: its server entry, and a module of server functions", () => {
    const entry = guidePage("tanstack-start", 'title="src/server.ts" side="page"', "export {}");
    const functions = guidePage(
      "tanstack-start",
      'title="src/users.ts" side="page"',
      'import { createServerFn } from "@tanstack/react-start"\n\nexport const users = createServerFn().handler(() => [])',
    );
    expect(apartOf(judge([entry, functions]))).toEqual([
      "docs/src/content/docs/frameworks/tanstack-start.mdx:2 page, the upgrade's tanstack-start-react: server",
      "docs/src/content/docs/frameworks/tanstack-start.mdx:2 page, the upgrade's tanstack-start-react: server",
    ]);
  });
});
