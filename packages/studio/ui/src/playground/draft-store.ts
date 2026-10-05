import { create } from "zustand";

/** What the Playground keeps while Studio is open: each endpoint's variables, the headers and the mode. */
export interface PlaygroundDrafts {
  /** The variables typed for each endpoint, by its key; an endpoint without starts from its sample. */
  variables: Readonly<Record<string, string>>;
  /** The headers, sent with every endpoint's calls; `undefined` until edited. */
  headers: string | undefined;
  mode: "direct" | "proxy";
  setVariables: (key: string, text: string) => void;
  resetVariables: (key: string) => void;
  setHeaders: (text: string | undefined) => void;
  setMode: (mode: "direct" | "proxy") => void;
}

/**
 * The Playground's drafts, kept in memory so leaving the page and coming
 * back keeps what was typed — and never written to storage, since headers
 * and variables can hold credentials.
 *
 * @example
 * ```ts
 * const text = usePlaygroundDrafts((s) => s.variables[endpoint.key]);
 * ```
 */
export const usePlaygroundDrafts = create<PlaygroundDrafts>()((set) => ({
  variables: {},
  headers: undefined,
  mode: "direct",
  setVariables: (key, text) => set((s) => ({ variables: { ...s.variables, [key]: text } })),
  resetVariables: (key) =>
    set((s) => ({
      variables: Object.fromEntries(Object.entries(s.variables).filter(([k]) => k !== key)),
    })),
  setHeaders: (text) => set({ headers: text }),
  setMode: (mode) => set({ mode }),
}));
