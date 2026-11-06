import type { Docs, DocsPage } from "./docs";
import { DOCS_LIMITS } from "./limits";

/** A part of a page a search finds, and where to read it. */
export interface SearchHit {
  /** The page's id, which `docs_read` takes. */
  readonly page: string;
  readonly title: string;
  /** The heading of the part, or the page's title for the part above its first heading. */
  readonly section: string;
  /** Where the site shows the part. */
  readonly url: string;
  /** The words of the part that answer the search best, cut to a few lines. */
  readonly snippet: string;
}

/* A part of a page under one heading, and its words. */
interface Section {
  readonly page: DocsPage;
  readonly heading: string;
  readonly anchor: string;
  readonly lines: readonly string[];
  /** Each field's words, counted: the page's title, the part's heading, its text. */
  readonly fields: readonly ReadonlyMap<string, number>[];
  readonly lengths: readonly number[];
}

/* How much a word found in each field counts: the page's title, the part's heading, its text. */
const FIELD_WEIGHTS = [3, 2, 1] as const;
const K1 = 1.2;
const B = 0.75;
/* A search that is a page's title or a heading, as written, counts this much more; one whose
   words stand together in either, this much. */
const EXACT_BOOST = 2;
const PHRASE_BOOST = 1.5;

/* How much more a part counts for a search its title or heading holds as written. */
function boost(section: Section, phrase: string): number {
  const named = [section.heading.toLowerCase(), section.page.title.toLowerCase()];
  if (named.includes(phrase)) return EXACT_BOOST;
  return phrase.includes(" ") && named.some((name) => name.includes(phrase)) ? PHRASE_BOOST : 1;
}

/* A word as a search compares it: lowercased, a plural's `s` let go. */
function stem(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

/**
 * The words of a text as a search reads them: letters and digits, each
 * identifier both whole and split where its case turns — `createProxyCaller`
 * is itself and `create`, `proxy`, `caller`.
 *
 * @param text - The text
 * @returns Its words, in order, lowercased
 */
export function wordsOf(text: string): string[] {
  const words: string[] = [];
  for (const run of text.match(/[\p{L}\p{N}]+/gu) ?? []) {
    const parts = run.match(/\p{Lu}+(?!\p{Ll})|\p{Lu}?\p{Ll}+|\p{N}+|\p{L}+/gu) ?? [run];
    words.push(stem(run.toLowerCase()));
    if (parts.length > 1) for (const part of parts) words.push(stem(part.toLowerCase()));
  }
  return words;
}

function counted(words: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
}

/* Each page's parts: what is above its first heading, then each heading's lines up to the next. */
function sectionsOf(page: DocsPage): Section[] {
  const lines = page.markdown.split("\n");
  const starts = [
    { heading: page.title, anchor: "", line: 0 },
    ...page.headings.map((h) => ({ heading: h.text, anchor: h.anchor, line: h.line })),
  ];
  return starts.map((start, at) => {
    const body = lines.slice(at === 0 ? 0 : start.line + 1, starts[at + 1]?.line ?? lines.length);
    const fields = [
      wordsOf(page.title),
      at === 0 ? [] : wordsOf(start.heading),
      wordsOf(body.join("\n")),
    ];
    return {
      page,
      heading: start.heading,
      anchor: start.anchor,
      lines: body,
      fields: fields.map(counted),
      lengths: fields.map((words) => words.length),
    };
  });
}

/* How many of the search's words a line holds. */
function holds(line: string, words: ReadonlySet<string>): number {
  return new Set(wordsOf(line).filter((word) => words.has(word))).size;
}

/* The line of the part that holds the most of the search's words, cut around the first of them. */
function snippetOf(section: Section, words: ReadonlySet<string>): string {
  const lines = section.lines
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("```"));
  const best = lines.reduce(
    (top, line) => (holds(line, words) > holds(top, words) ? line : top),
    lines[0] ?? "",
  );
  const characters = Array.from(best);
  if (characters.length <= DOCS_LIMITS.snippetChars) return best;
  const first = [...best.matchAll(/[\p{L}\p{N}]+/gu)].find((match) =>
    words.has(stem(match[0].toLowerCase())),
  );
  const before = Array.from(best.slice(0, first?.index ?? 0)).length;
  const start = Math.max(0, Math.min(before - 60, characters.length - DOCS_LIMITS.snippetChars));
  const shown = characters.slice(start, start + DOCS_LIMITS.snippetChars - 2).join("");
  return `${start > 0 ? "…" : ""}${shown}${start + DOCS_LIMITS.snippetChars - 2 < characters.length ? "…" : ""}`;
}

/** The docs' parts, ready to be searched. */
export interface SearchIndex {
  /**
   * The parts of the docs that answer a search best: by how often its words
   * stand in each part's page title, heading and text — the rarer a word,
   * the more it counts — and more when the words stand together in a
   * heading. No more than two parts of one page, and ties in the docs' order.
   *
   * @param query - What to look for: words, an export's name, an option
   * @param limit - The most results
   * @returns The results, best first
   */
  search(query: string, limit: number): SearchHit[];
}

/**
 * Index the docs for search: every part of every page, its words counted
 * by field. Built once, as the first search asks for it.
 *
 * @param docs - The docs
 * @returns The index
 * @example
 * ```ts
 * searchIndex(docs).search("cancel previous", 5)[0]?.page; // "advanced/abort"
 * ```
 */
export function searchIndex(docs: Docs): SearchIndex {
  const sections = [...docs.pages.values()].flatMap(sectionsOf);
  const average = FIELD_WEIGHTS.map(
    (_, field) =>
      sections.reduce((sum, section) => sum + (section.lengths[field] ?? 0), 0) /
      Math.max(1, sections.length),
  );
  const holding = new Map<string, number>();
  for (const section of sections) {
    const words = new Set(section.fields.flatMap((field) => [...field.keys()]));
    for (const word of words) holding.set(word, (holding.get(word) ?? 0) + 1);
  }
  const rarity = (word: string) => {
    const df = holding.get(word) ?? 0;
    return Math.log(1 + (sections.length - df + 0.5) / (df + 0.5));
  };

  return {
    search(query, limit) {
      const words = [...new Set(wordsOf(query))].slice(0, DOCS_LIMITS.queryWords);
      if (words.length === 0) return [];
      const phrase = query.trim().toLowerCase();
      const scored = sections.flatMap((section, order) => {
        let score = 0;
        for (const word of words) {
          let weighted = 0;
          section.fields.forEach((field, at) => {
            const count = field.get(word) ?? 0;
            if (count === 0) return;
            const norm = 1 - B + (B * (section.lengths[at] ?? 0)) / Math.max(1, average[at] ?? 1);
            weighted += (FIELD_WEIGHTS[at] ?? 1) * ((count * (K1 + 1)) / (count + K1 * norm));
          });
          score += rarity(word) * weighted;
        }
        return score === 0 ? [] : [{ section, order, score: score * boost(section, phrase) }];
      });
      scored.sort((a, b) => b.score - a.score || a.order - b.order);
      const taken = new Map<string, number>();
      const hits: SearchHit[] = [];
      const wanted = new Set(words);
      for (const { section } of scored) {
        const fromPage = taken.get(section.page.id) ?? 0;
        if (fromPage >= DOCS_LIMITS.resultsPerPage) continue;
        taken.set(section.page.id, fromPage + 1);
        hits.push({
          page: section.page.id,
          title: section.page.title,
          section: section.heading,
          url: section.anchor === "" ? section.page.url : `${section.page.url}#${section.anchor}`,
          snippet: snippetOf(section, wanted),
        });
        if (hits.length >= limit) break;
      }
      return hits;
    },
  };
}
