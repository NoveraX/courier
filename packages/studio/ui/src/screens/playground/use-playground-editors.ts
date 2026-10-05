import { useMemo } from "react";

import type { PlaygroundEndpoint } from "@/features/playground/endpoint-choices";
import { variablesStubOf } from "@/features/playground/variables-stub";
import { usePlaygroundDrafts } from "@/playground/draft-store";
import { useStudioStore } from "@/store";
import type { EditorText } from "./request-pane";

/* Headers start empty; an endpoint's variables start from its sample. */
const NO_HEADERS = "{}";

/** The two editors' texts and the mode, as the drafts keep them. */
export interface PlaygroundEditors {
  variables: EditorText;
  headers: EditorText;
  mode: "direct" | "proxy";
  setMode: (mode: "direct" | "proxy") => void;
}

/**
 * The endpoint's variables — what was typed for it, or its sample — the
 * headers sent with every call, and the mode, kept while Studio is open.
 *
 * @param endpoint - The endpoint chosen
 * @returns The editors and the mode
 * @example
 * ```ts
 * const { variables, headers } = usePlaygroundEditors(endpoint);
 * ```
 */
export function usePlaygroundEditors(endpoint: PlaygroundEndpoint): PlaygroundEditors {
  const indent = useStudioStore((s) => s.settings.jsonIndent);
  const typed = usePlaygroundDrafts((s) => s.variables[endpoint.key]);
  const headers = usePlaygroundDrafts((s) => s.headers) ?? NO_HEADERS;
  const mode = usePlaygroundDrafts((s) => s.mode);
  const { setVariables, resetVariables, setHeaders, setMode } = usePlaygroundDrafts.getState();
  const sample = useMemo(() => variablesStubOf(endpoint.def, indent), [endpoint.def, indent]);
  const text = typed ?? sample;
  return {
    variables: {
      text,
      changed: text !== sample,
      onChange: (next) => setVariables(endpoint.key, next),
      onReset: () => resetVariables(endpoint.key),
    },
    headers: {
      text: headers,
      changed: headers !== NO_HEADERS,
      onChange: setHeaders,
      onReset: () => setHeaders(undefined),
    },
    mode,
    setMode,
  };
}
