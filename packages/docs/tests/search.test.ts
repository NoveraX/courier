/**
 * Searching the docs: the parts of a page whose title, heading and text
 * hold a search's words — the rarer the word, the more it counts —
 * best first, no more than two of one page, each quoting the lines that
 * match within a few hundred characters. Any search, however it is
 * written, answers within its limits, and the whole docs index quickly.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type Docs, loadDocs } from "../src/docs";
import { DOCS_LIMITS } from "../src/limits";
import { type SearchIndex, searchIndex, wordsOf } from "../src/search";
import { type Bundled, bundled } from "./support/bundled";

let folder: Bundled;
let docs: Docs;
let index: SearchIndex;
let indexedMs: number;

beforeAll(() => {
  folder = bundled();
  docs = loadDocs(folder.dir);
  const started = performance.now();
  index = searchIndex(docs);
  indexedMs = performance.now() - started;
});

afterAll(() => folder.remove());

/* A seeded run of numbers, so a failing search can be found again. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

describe("a search's words", () => {
  it("are an identifier whole and its parts, lowercased, a plural's s let go", () => {
    expect(wordsOf("createProxyCaller HTTPError calls x-visitor-address")).toEqual([
      "createproxycaller",
      "create",
      "proxy",
      "caller",
      "httperror",
      "http",
      "error",
      "call",
      "x",
      "visitor",
      "address",
    ]);
  });
});

describe("a search", () => {
  it("finds an export's pages by its name, and by the words of its name", () => {
    const named = [...new Set(index.search("createProxyCaller", 5).map((hit) => hit.page))];
    expect(named.slice(0, 2).sort()).toEqual([
      "api/create-proxy-caller",
      "proxy-mode/proxy-caller",
    ]);
    expect(index.search("proxy caller", 5).map((hit) => hit.page)).toContain(
      "api/create-proxy-caller",
    );
  });

  it("finds the part of a page under the heading that holds its words, with that part's address", () => {
    const [hit] = index.search("rate limits", 5);
    expect(hit).toMatchObject({
      page: "proxy-mode/overview",
      section: "Rate limits",
      url: "https://courier.noverax.cloud/docs/proxy-mode/overview#rate-limits",
    });
  });

  it("answers with no more than it was asked for, two parts of a page at most", () => {
    for (const query of ["proxy", "mock server scenario", "studio", "upload progress"]) {
      const hits = index.search(query, DOCS_LIMITS.maxResults);
      expect(hits.length).toBeLessThanOrEqual(DOCS_LIMITS.maxResults);
      const perPage = new Map<string, number>();
      for (const hit of hits) perPage.set(hit.page, (perPage.get(hit.page) ?? 0) + 1);
      expect(Math.max(...perPage.values())).toBeLessThanOrEqual(DOCS_LIMITS.resultsPerPage);
      expect(hits.every((hit) => hit.snippet.length <= DOCS_LIMITS.snippetChars)).toBe(true);
      expect(hits.every((hit) => docs.pages.get(hit.page)?.url === hit.url.split("#")[0])).toBe(
        true,
      );
      expect(index.search(query, DOCS_LIMITS.maxResults)).toEqual(hits);
    }
  });

  it("finds nothing for words no page holds, and for no words", () => {
    expect(index.search("zzqx", 5)).toEqual([]);
    expect(index.search("  ", 5)).toEqual([]);
    expect(index.search("!!! ???", 5)).toEqual([]);
  });

  it("answers any search, however written, within its limits and quickly", () => {
    const next = seeded(29);
    const alphabet =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456789 -_.,:;'\"`#*/\\()[]{}<>éλΩ🚀\u0000\u200b";
    let slowest = 0;
    for (let run = 0; run < 300; run += 1) {
      const length = Math.floor(next() * DOCS_LIMITS.queryChars);
      const query = Array.from(
        { length },
        () => alphabet[Math.floor(next() * alphabet.length)],
      ).join("");
      const started = performance.now();
      const hits = index.search(query, 1 + Math.floor(next() * DOCS_LIMITS.maxResults));
      slowest = Math.max(slowest, performance.now() - started);
      expect(hits.length).toBeLessThanOrEqual(DOCS_LIMITS.maxResults);
      expect(hits.every((hit) => hit.snippet.length <= DOCS_LIMITS.snippetChars)).toBe(true);
    }
    expect(slowest).toBeLessThan(200);
  });
});

describe("the index", () => {
  it("is built over the whole docs in a fraction of a second", () => {
    expect(indexedMs).toBeLessThan(1_000);
  });
});
