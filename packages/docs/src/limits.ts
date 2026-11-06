/**
 * Every limit the docs server keeps, in one place: what a call may ask for,
 * how much an answer holds, and how much of the docs folder it reads.
 */
export const DOCS_LIMITS = {
  /** The longest search a call may make, in characters, and the most words of it that count. */
  queryChars: 200,
  queryWords: 12,
  /** The most results a search answers with, and how many when the call names none. */
  maxResults: 10,
  defaultResults: 5,
  /** The most sections of one page among a search's results. */
  resultsPerPage: 2,
  /** The longest piece of a section a result quotes, in characters. */
  snippetChars: 240,
  /** The most of a page one read answers with, in characters: the rest is read from where it stopped. */
  readChars: 32_000,
  /** The longest answer the server hands a model, in characters. */
  resultChars: 64_000,
  /** The most the server reads of the docs folder: its manifest, any one page, and every page together. */
  manifestBytes: 2 * 1024 * 1024,
  pageBytes: 512 * 1024,
  folderBytes: 8 * 1024 * 1024,
} as const;
