import type { Docs, DocsPage } from "./docs";
import { DOCS_LIMITS } from "./limits";
import { wordsOf } from "./search";

/** What a read asks for: a page, one of its parts, and where in it to start. */
export interface ReadRequest {
  /** The page: its id, its address under `/docs`, or its address on the site — `.md` and `#anchor` after it too. */
  readonly page: string;
  /** One of its parts, by its heading's words or its anchor; the whole page when absent. */
  readonly section?: string | undefined;
  /** Where in the page or part to start, in characters: what a read before it said to read on from. */
  readonly offset?: number | undefined;
}

/** What a read came to: the text, or why there is none. */
export type ReadOutcome =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly message: string };

/* The page an address names, and the anchor after it. */
function addressed(docs: Docs, page: string): { id: string; anchor: string } {
  const [path = "", anchor = ""] = page.trim().split("#", 2);
  const id = path
    .replace(docs.manifest.site, "")
    .replace(/^\/+/, "")
    .replace(/^docs\//, "")
    .replace(/[?].*$/, "")
    .replace(/\.md$/, "")
    .replace(/\/+$/, "");
  return { id, anchor };
}

/* The pages whose id or title shares the most words with what was asked: the ones meant, likely. */
function nearest(docs: Docs, asked: string): string[] {
  const words = new Set(wordsOf(asked));
  return [...docs.pages.values()]
    .map((page) => ({
      page,
      shared: wordsOf(`${page.id} ${page.title}`).filter((word) => words.has(word)).length,
    }))
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, 5)
    .map(({ page }) => page.id);
}

/** A page, or a part of it under one heading: its title, its anchor on the site and its text. */
interface Part {
  readonly title: string;
  readonly anchor: string;
  readonly text: string;
}

/* The lines of a page's part, under the heading a read names by its words or its anchor. */
function partOf(page: DocsPage, section: string): Part | undefined {
  const asked = section.trim().toLowerCase();
  const at = page.headings.findIndex(
    (heading) => heading.anchor === asked || heading.text.toLowerCase() === asked,
  );
  const heading = page.headings[at];
  if (heading === undefined) return undefined;
  const next = page.headings.slice(at + 1).find((later) => later.depth <= heading.depth);
  const lines = page.markdown.split("\n");
  const text = lines.slice(heading.line, next?.line ?? lines.length).join("\n");
  return { title: heading.text, anchor: heading.anchor, text };
}

/* Up to `most` characters of the text from `start`: ended at a line's end when it goes on past
   them, and never between the two halves of one character. */
function piece(text: string, start: number, most: number): string {
  if (text.length - start <= most) return text.slice(start);
  let cut = text.slice(start, start + most);
  const lineEnd = cut.lastIndexOf("\n");
  if (lineEnd > 0) return cut.slice(0, lineEnd + 1);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}

/**
 * Read a page of the docs, or one part of it, from where a read before it
 * stopped: no more than the read limit's characters, ended at a line's
 * end, with a line on top saying what it is, where on the site it is, and
 * where to read on from.
 *
 * @param docs - The docs
 * @param request - The page, the part and where to start
 * @returns The text, or why there is none: no such page, no such part, an offset past its end
 * @example
 * ```ts
 * readPage(docs, { page: "/docs/advanced/abort#cancel-previous" });
 * ```
 */
export function readPage(docs: Docs, request: ReadRequest): ReadOutcome {
  const { id, anchor } = addressed(docs, request.page);
  const page = docs.pages.get(id);
  if (page === undefined) {
    const near = nearest(docs, request.page);
    return {
      ok: false,
      message: `The docs have no page ${JSON.stringify(id)}${near.length > 0 ? `; near it: ${near.join(", ")}` : ""}. docs_list lists every page.`,
    };
  }
  const section = request.section ?? (anchor === "" ? undefined : anchor);
  const part: Part | undefined =
    section === undefined
      ? { title: page.title, anchor: "", text: page.markdown }
      : partOf(page, section);
  if (part === undefined) {
    const headings = page.headings.slice(0, 20).map((heading) => heading.text);
    return {
      ok: false,
      message: `${page.id} has no part ${JSON.stringify(section)}; its parts: ${headings.join(" · ")}`,
    };
  }
  const total = part.text.length;
  const offset = request.offset ?? 0;
  if (offset > total)
    return {
      ok: false,
      message: `${page.id} has ${total} characters there, fewer than the offset ${offset}`,
    };
  const text = piece(part.text, offset, DOCS_LIMITS.readChars);
  const end = offset + text.length;
  const where =
    end < total
      ? `characters ${offset}–${end} of ${total}; read on with offset ${end}`
      : offset > 0
        ? `characters ${offset}–${end}, its end`
        : "whole";
  const url = part.anchor === "" ? page.url : `${page.url}#${part.anchor}`;
  return {
    ok: true,
    text: `Courier ${docs.manifest.version} docs · ${page.id} · ${part.title} · ${url} · ${where}\n\n${text}`,
  };
}
