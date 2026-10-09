import { create } from "zustand";

/** A specification another view asks the import wizard to open with. */
export interface ImportRequest {
  /** The specification's text, pasted as the wizard's raw source */
  content: string;
  /** Read from the calls Studio recorded: the import stays tied to its traffic. */
  fromTraffic?: boolean | undefined;
}

/**
 * The specification the import wizard is asked to open with — one Studio
 * read from a source's traffic — taken by the APIs page as it shows.
 *
 * @example
 * ```ts
 * useImportRequest.setState({ request: { content: text } });
 * ```
 */
export const useImportRequest = create<{ request: ImportRequest | null }>(() => ({
  request: null,
}));
