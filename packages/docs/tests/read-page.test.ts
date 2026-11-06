/**
 * Reading a page of the docs, or a part of it: by its id, its address
 * under `/docs` or on the site, `.md` and `#anchor` included. A page
 * longer than a read's limit is read in pieces, each ended at a line's
 * end and saying where to read on from — and the pieces put together are
 * the page. A page or part the docs do not have is answered with what is
 * near it, and nothing outside the folder is ever read.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type Docs, loadDocs } from "../src/docs";
import { DOCS_LIMITS } from "../src/limits";
import { readPage } from "../src/read-page";
import { type Bundled, bundled } from "./support/bundled";

let folder: Bundled;
let docs: Docs;

beforeAll(() => {
  folder = bundled();
  docs = loadDocs(folder.dir);
});

afterAll(() => folder.remove());

/* A read's first line, and the text below it. */
function split(text: string): { head: string; body: string } {
  const at = text.indexOf("\n\n");
  return { head: text.slice(0, at), body: text.slice(at + 2) };
}

function read(page: string, section?: string, offset?: number, from: Docs = docs) {
  const outcome = readPage(from, { page, section, offset });
  if (!outcome.ok) throw new Error(outcome.message);
  return split(outcome.text);
}

describe("a page", () => {
  it("is read whole when it fits, under a line that says what and where it is", () => {
    const { head, body } = read("quick-start");
    expect(head).toBe(
      "Courier 0.0.0-test docs · quick-start · Quick Start · https://courier.noverax.cloud/docs/quick-start · whole",
    );
    expect(body).toBe(docs.pages.get("quick-start")?.markdown);
  });

  it("is read in pieces when it is long, which put together are the page — every page", () => {
    /* A page longer than two reads, made of one the docs have: none of theirs may be that long. */
    const quick = docs.pages.get("quick-start");
    if (quick === undefined) throw new Error("The docs have no quick-start page");
    const times = Math.ceil((2.5 * DOCS_LIMITS.readChars) / quick.markdown.length);
    const long = { ...quick, id: "long", markdown: `${quick.markdown}\n`.repeat(times) };
    const withLong: Docs = { ...docs, pages: new Map([...docs.pages, ["long", long]]) };
    for (const page of withLong.pages.values()) {
      let offset = 0;
      let whole = "";
      for (let piece = 0; piece < 100; piece += 1) {
        const { head, body } = read(page.id, undefined, offset, withLong);
        expect(body.length, page.id).toBeLessThanOrEqual(DOCS_LIMITS.readChars);
        whole += body;
        const next = /read on with offset (\d+)$/.exec(head)?.[1];
        if (next === undefined) break;
        expect(body.endsWith("\n"), page.id).toBe(true);
        offset = Number(next);
      }
      expect(whole, page.id).toBe(page.markdown);
    }
    expect(read("long", undefined, undefined, withLong).head).toMatch(/read on with offset \d+$/);
  });

  it("is found by its address under /docs and on the site, .md and #anchor too", () => {
    const byAnchor = read(
      "https://courier.noverax.cloud/docs/advanced/abort.md#cancelling-the-previous-call",
    );
    expect(byAnchor.head).toContain(
      "Cancelling the previous call · https://courier.noverax.cloud/docs/advanced/abort#cancelling-the-previous-call",
    );
    expect(byAnchor.body.startsWith("## Cancelling the previous call\n")).toBe(true);
    expect(read("/docs/quick-start").body).toBe(read("quick-start.md").body);
  });

  it("is read in one part, by its heading's words or its anchor, up to the next heading of its rank", () => {
    const byWords = read("proxy-mode/overview", "Rate limits");
    const byAnchor = read("proxy-mode/overview", "rate-limits");
    expect(byWords).toEqual(byAnchor);
    expect(byWords.body.startsWith("### Rate limits\n")).toBe(true);
    expect(byWords.body).not.toContain("\n### Upstream redirects");
  });
});

describe("a read the docs cannot answer", () => {
  it("names the pages near a page they do not have", () => {
    const outcome = readPage(docs, { page: "proxy caller" });
    expect(outcome).toMatchObject({ ok: false });
    expect(!outcome.ok && outcome.message).toContain("near it: ");
    expect(!outcome.ok && outcome.message).toContain("proxy-mode/proxy-caller");
  });

  it("names a page's parts when it has none of the one asked for", () => {
    const outcome = readPage(docs, { page: "advanced/abort", section: "Nowhere" });
    expect(!outcome.ok && outcome.message).toMatch(
      /^advanced\/abort has no part "Nowhere"; its parts: Overview · /,
    );
  });

  it("says so for an offset past a page's end", () => {
    const outcome = readPage(docs, { page: "quick-start", offset: 10_000_000 });
    expect(!outcome.ok && outcome.message).toMatch(/fewer than the offset 10000000$/);
  });

  it.each(["../manifest", "/etc/passwd", "..%2f..%2fetc", "index", "manifest.json", "\\..\\x"])(
    "reads nothing outside the pages for %s",
    (page) => {
      expect(readPage(docs, { page })).toMatchObject({ ok: false });
    },
  );
});
