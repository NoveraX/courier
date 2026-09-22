import { useState, useCallback } from "react";

import { useStudioStore } from "@/store";

import type {
  ImportStep,
  ImportSource,
  ImportState,
  GenerateOptions,
} from "./types";
import {
  parseSpec,
  buildPostParseState,
  generatePreview,
  writeGeneratedFiles,
  toggleEndpointReducer,
  toggleGroupReducer,
  toggleAllReducer,
} from "./import-actions";

export interface UseImportReturn {
  state: ImportState;
  parsing: boolean;
  error: string | null;
  open: boolean;
  openWizard: (source?: ImportSource) => void;
  close: () => void;
  setSource: (source: ImportSource) => void;
  setContent: (content: string) => void;
  parse: () => Promise<void>;
  toggleEndpoint: (group: string, endpoint: string) => void;
  toggleGroup: (groupName: string) => void;
  toggleAll: () => void;
  setOptions: (patch: Partial<GenerateOptions>) => void;
  preview: () => Promise<void>;
  write: () => Promise<void>;
  goToStep: (step: ImportStep) => void;
}

const INITIAL_STATE: ImportState = {
  step: "import",
  source: "url",
  content: "",
  spec: null,
  options: {
    sourceName: "api",
    outputDir: "src/api",
    validation: "zod",
    groupBy: "tag",
    generateTypes: true,
    generateSchemas: true,
    addAuthMiddleware: false,
    includeComments: true,
    generateClient: "direct",
    selectedEndpoints: null,
  },
  selectedEndpoints: {},
  generatedFiles: [],
  writing: false,
};

export function useImport(onSuccess?: () => void): UseImportReturn {
  const [state, setState] = useState<ImportState>({ ...INITIAL_STATE });
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const settings = useStudioStore((s) => s.settings);

  const openWizard = useCallback((source?: ImportSource) => {
    setState({ ...INITIAL_STATE, source: source ?? "url" });
    setError(null);
    setOpen(true);
  }, []);

  const close = useCallback(() => { setOpen(false); setError(null); }, []);

  const setSource = useCallback((source: ImportSource) => {
    setState((s) => ({ ...s, source, content: "" }));
    setError(null);
  }, []);

  const setContent = useCallback((content: string) => {
    setState((s) => ({ ...s, content }));
    setError(null);
  }, []);

  const parse = useCallback(async () => {
    setParsing(true);
    setError(null);
    try {
      const spec = await parseSpec(state.source, state.content);
      const sourceUrl = state.source === "url" ? state.content : undefined;
      const patch = buildPostParseState(spec, settings, sourceUrl);
      setState((s) => ({ ...s, ...patch }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse spec");
    } finally {
      setParsing(false);
    }
  }, [state.source, state.content, settings]);

  const preview = useCallback(async () => {
    if (!state.spec) return;
    setParsing(true);
    setError(null);
    try {
      const files = await generatePreview(state.spec, state.options, state.selectedEndpoints);
      setState((s) => ({ ...s, step: "preview", generatedFiles: files }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code generation failed");
    } finally {
      setParsing(false);
    }
  }, [state.spec, state.options, state.selectedEndpoints]);

  const write = useCallback(async () => {
    setState((s) => ({ ...s, writing: true }));
    setError(null);
    try {
      await writeGeneratedFiles(state);
      close();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    } finally {
      setState((s) => ({ ...s, writing: false }));
    }
  }, [state, close, onSuccess]);

  return {
    state, parsing, error, open,
    openWizard, close, setSource, setContent, parse,
    toggleEndpoint: useCallback((g: string, e: string) => setState((s) => toggleEndpointReducer(s, g, e)), []),
    toggleGroup: useCallback((g: string) => setState((s) => toggleGroupReducer(s, g)), []),
    toggleAll: useCallback(() => setState(toggleAllReducer), []),
    setOptions: useCallback((patch: Partial<GenerateOptions>) => setState((s) => ({ ...s, options: { ...s.options, ...patch } })), []),
    preview, write,
    goToStep: useCallback((step: ImportStep) => { setState((s) => ({ ...s, step })); setError(null); }, []),
  };
}
