import { create } from "zustand";

/** What the Playground keeps of what was typed: each endpoint's variables, the headers and the mode. */
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
 * The Playground's drafts, which Studio keeps for the project: a page is
 * sent them as it connects and follows what another page changes, and a
 * page with the token sends what is typed once the typing pauses. Leaving
 * the page, reloading it or opening Studio in another browser keeps what
 * was typed. Studio writes them down as it writes the history, each
 * credential in the headers replaced with `[redacted]`, so a Studio that
 * restarts has `[redacted]` in its place.
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
