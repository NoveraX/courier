import { useCallback, useEffect, useState } from "react";

import { post } from "@/lib/api-client";

import type {
  MockGeneratorOptions,
  MockGeneratorState,
  MockWizardStep,
} from "./types";
import { buildEndpointSelections } from "./build-endpoint-selections";
import { generateMockFiles } from "./generate-mock-files";
import { buildInitialState, openMockWizard, wizardBus } from "./mock-generator-defaults";
import {
  applyOptions,
  applyStandalone,
  applyStep,
  applyToggleAll,
  applyToggleEndpoint,
  applyToggleGroup,
  applyToggleSource,
} from "./mock-generator-actions";

// Re-export the global open trigger so existing imports keep working
export { openMockWizard };

export interface UseMockGeneratorReturn {
  state: MockGeneratorState;
  open: boolean;
  error: string | null;
  loading: boolean;
  openWizard: () => void;
  close: () => void;
  goToStep: (step: MockWizardStep) => void;
  toggleSource: (sourceName: string) => void;
  setStandalone: (standalone: boolean) => void;
  setOptions: (patch: Partial<MockGeneratorOptions>) => void;
  toggleEndpoint: (source: string, group: string, endpoint: string) => void;
  toggleGroup: (source: string, group: string) => void;
  toggleAll: () => void;
  generatePreview: () => void;
  writeFiles: () => Promise<void>;
}

export function useMockGenerator(onSuccess?: () => void): UseMockGeneratorReturn {
  const [state, setState] = useState<MockGeneratorState>(buildInitialState());
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const openWizard = useCallback(() => {
    setState(buildInitialState());
    setError(null);
    setOpen(true);
  }, []);

  // Listen for global open trigger
  useEffect(() => {
    const handler = (): void => openWizard();
    wizardBus.addEventListener("open", handler);
    return () => wizardBus.removeEventListener("open", handler);
  }, [openWizard]);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const goToStep = useCallback((step: MockWizardStep) => {
    setState((s) => applyStep(s, step));
    setError(null);
  }, []);

  const toggleSource = useCallback((sourceName: string) => {
    setState((s) => applyToggleSource(s, sourceName));
  }, []);

  const setStandalone = useCallback((standalone: boolean) => {
    setState((s) => applyStandalone(s, standalone));
  }, []);

  const setOptions = useCallback((patch: Partial<MockGeneratorOptions>) => {
    setState((s) => applyOptions(s, patch));
  }, []);

  const toggleEndpoint = useCallback((source: string, group: string, endpoint: string) => {
    setState((s) => applyToggleEndpoint(s, source, group, endpoint));
  }, []);

  const toggleGroup = useCallback((source: string, group: string) => {
    setState((s) => applyToggleGroup(s, source, group));
  }, []);

  const toggleAll = useCallback(() => {
    setState((s) => applyToggleAll(s));
  }, []);

  const generatePreview = useCallback(() => {
    setLoading(true);
    setError(null);

    try {
      const { endpoints, sourceFilePaths } = buildEndpointSelections(state.selectedSources);
      const stateWithPaths = { ...state, endpoints, sourceFilePaths };
      const files = generateMockFiles(stateWithPaths);

      setState((s) => ({
        ...s,
        step: "review",
        endpoints,
        sourceFilePaths,
        generatedFiles: files,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [state]);

  const writeFiles = useCallback(async () => {
    setState((s) => ({ ...s, writing: true }));
    setError(null);

    try {
      await post("/api/apis/write", { files: state.generatedFiles });
      close();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setState((s) => ({ ...s, writing: false }));
    }
  }, [state.generatedFiles, close, onSuccess]);

  return {
    state,
    open,
    error,
    loading,
    openWizard,
    close,
    goToStep,
    toggleSource,
    setStandalone,
    setOptions,
    toggleEndpoint,
    toggleGroup,
    toggleAll,
    generatePreview,
    writeFiles,
  };
}
