import { useCallback, useEffect, useState } from "react";
import { INITIAL_IMPORT_STATE } from "@/features/apis/initial-import-state";
import { consentFor, toggleConfirmed } from "@/features/apis/plan-consent";
import { readPlanRefusal } from "@/features/apis/plan-refusal";
import { settleWrite } from "@/features/apis/settle-write";
import type { GenerateOptions, ImportSource, ImportState, ImportStep } from "@/features/apis/types";
import { useStudioStore } from "@/store";
import {
  buildPostParseState,
  generatePreview,
  parseSpec,
  toggleAllReducer,
  toggleEndpointReducer,
  toggleGroupReducer,
  writeGeneratedFiles,
} from "./import-actions";
import { keptImport, useKeptImport } from "./kept-import";

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
  /** Allow a step of the plan Studio refused to apply unasked, or withdraw allowing it. */
  toggleConfirmed: (path: string) => void;
  goToStep: (step: ImportStep) => void;
}

/**
 * The import wizard's state and actions. A write that leaves part of the
 * declaration to courier.config keeps the wizard open on the declare step,
 * which shows it; any other write closes the wizard. A write Studio will not
 * apply unasked keeps it on the preview with the plan, whose steps the user
 * allows before writing again; a new preview drops that plan.
 *
 * @param onWritten - Told what was written, once Studio wrote the files
 * @returns The wizard's state and actions
 *
 * @example
 * ```ts
 * const wizard = useImport((message) => toast.success(message));
 * ```
 */
export function useImport(onWritten?: (message: string) => void): UseImportReturn {
  const [state, setState] = useState<ImportState>({ ...INITIAL_IMPORT_STATE });
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const settings = useStudioStore((s) => s.settings);

  /* An import left unfinished opens again with what was typed, unless another source is asked for. */
  const openWizard = useCallback((source?: ImportSource) => {
    const kept = useKeptImport.getState().kept;
    const resume = kept !== null && (source === undefined || source === kept.source);
    setState({
      ...INITIAL_IMPORT_STATE,
      source: resume ? kept.source : (source ?? "url"),
      content: resume ? kept.content : "",
      fromTraffic: resume && kept.fromTraffic === true,
    });
    setError(null);
    setOpen(true);
  }, []);

  /* What is typed is kept until a write ends the import. */
  useEffect(() => {
    if (open)
      useKeptImport.setState({ kept: keptImport(state.source, state.content, state.fromTraffic) });
  }, [open, state.source, state.content, state.fromTraffic]);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const setSource = useCallback((source: ImportSource) => {
    setState((s) => ({ ...s, source, content: "", fromTraffic: false }));
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
      setState((s) => ({ ...s, step: "preview", generatedFiles: files, consent: null }));
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
      const settled = settleWrite(state, await writeGeneratedFiles(state));
      useKeptImport.setState({ kept: null });
      if (settled.state.step === "declare") setState(settled.state);
      else close();
      onWritten?.(settled.message);
    } catch (err) {
      /* A refusal with a plan shows it; one without leaves no plan standing that no longer applies. */
      const refusal = readPlanRefusal(err);
      setState((s) => ({ ...s, consent: refusal ? consentFor(refusal.plan) : null }));
      setError(err instanceof Error ? err.message : "Write failed");
    } finally {
      setState((s) => ({ ...s, writing: false }));
    }
  }, [state, close, onWritten]);

  return {
    state,
    parsing,
    error,
    open,
    openWizard,
    close,
    setSource,
    setContent,
    parse,
    toggleEndpoint: useCallback(
      (g: string, e: string) => setState((s) => toggleEndpointReducer(s, g, e)),
      [],
    ),
    toggleGroup: useCallback((g: string) => setState((s) => toggleGroupReducer(s, g)), []),
    toggleAll: useCallback(() => setState(toggleAllReducer), []),
    setOptions: useCallback(
      (patch: Partial<GenerateOptions>) =>
        setState((s) => ({ ...s, options: { ...s.options, ...patch } })),
      [],
    ),
    preview,
    write,
    toggleConfirmed: useCallback(
      (path: string) =>
        setState((s) => (s.consent ? { ...s, consent: toggleConfirmed(s.consent, path) } : s)),
      [],
    ),
    goToStep: useCallback((step: ImportStep) => {
      setState((s) => ({ ...s, step }));
      setError(null);
    }, []),
  };
}
