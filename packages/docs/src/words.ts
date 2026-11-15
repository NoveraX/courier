import { stemOf } from "./stem";

/** How a search stems a lowercased word: {@link stemOf}, or a memo of it. */
export type Stemmer = (word: string) => string;

/**
 * The words of a text as a search compares them: letters and digits, each
 * identifier both whole and split where its case turns — `createProxyCaller`
 * is itself and `create`, `proxy`, `caller` — each lowercased and stemmed
 * as English, so `mapping` is `map` and `retries` is `retry`'s `retri`.
 *
 * @param text - The text
 * @param stem - How each word is stemmed
 * @returns Its words' stems, in order
 * @example
 * ```ts
 * wordsOf("mapped retries"); // ["map", "retri"]
 * ```
 */
export function wordsOf(text: string, stem: Stemmer = stemOf): string[] {
  const words: string[] = [];
  for (const run of text.match(/[\p{L}\p{N}]+/gu) ?? []) {
    const parts = run.match(/\p{Lu}+(?!\p{Ll})|\p{Lu}?\p{Ll}+|\p{N}+|\p{L}+/gu) ?? [run];
    words.push(stem(run.toLowerCase()));
    if (parts.length > 1) for (const part of parts) words.push(stem(part.toLowerCase()));
  }
  return words;
}

/** The stemmers of one index: for the docs' words as it is built, and for a search's. */
export interface IndexStemmers {
  /** Stems a word of the docs, and keeps its stem */
  readonly indexed: Stemmer;
  /** Stems a search's word: the stem kept for a word of the docs, any other's anew, not kept */
  readonly asked: Stemmer;
}

/**
 * Stemmers that stem each word of the docs once, however often it stands
 * in them, and keep nothing a search brings: a long-running server holds
 * the docs' words alone, whatever it is asked.
 *
 * @returns The stemmers
 * @example
 * ```ts
 * const { indexed, asked } = indexStemmers();
 * wordsOf(page.markdown, indexed); wordsOf(query, asked);
 * ```
 */
export function indexStemmers(): IndexStemmers {
  const stems = new Map<string, string>();
  return {
    indexed: (word) => {
      const known = stems.get(word);
      if (known !== undefined) return known;
      const stem = stemOf(word);
      stems.set(word, stem);
      return stem;
    },
    asked: (word) => stems.get(word) ?? stemOf(word),
  };
}
