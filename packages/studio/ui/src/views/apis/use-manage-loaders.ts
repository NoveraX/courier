/**
 * Inventory loading callbacks used by `useManage`.
 *
 * Extracted so the main hook only orchestrates state, while the network +
 * step transition logic lives here as a small custom hook.
 */

import { useCallback } from "react";

import type {
  EndpointInventory,
  ManageStep,
  ParsedSpec,
} from "./types";
import { fetchInventory, parseSpecFromUrl } from "./client";

interface LoaderDeps {
  setStep: (step: ManageStep) => void;
  setError: (error: string | null) => void;
  setInventory: (inventory: EndpointInventory | null) => void;
  setSpec: (spec: ParsedSpec | null) => void;
}

interface InventoryLoaders {
  loadInventory: (name: string, parsedSpec: ParsedSpec) => Promise<void>;
  fetchSpecAndLoadInventory: (name: string, specUrl: string) => Promise<void>;
}

export function useInventoryLoaders(deps: LoaderDeps): InventoryLoaders {
  const { setStep, setError, setInventory, setSpec } = deps;

  const loadInventory = useCallback(async (name: string, parsedSpec: ParsedSpec) => {
    setStep("loading");
    setError(null);
    try {
      const inv = await fetchInventory(name, parsedSpec);
      setInventory(inv);
      setStep("inventory");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory");
    }
  }, [setStep, setError, setInventory]);

  const fetchSpecAndLoadInventory = useCallback(async (name: string, specUrl: string) => {
    setStep("loading");
    setError(null);
    try {
      const parsedSpec = await parseSpecFromUrl(specUrl);
      setSpec(parsedSpec);
      const inv = await fetchInventory(name, parsedSpec);
      setInventory(inv);
      setStep("inventory");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch spec");
      setStep("reupload");
    }
  }, [setStep, setError, setInventory, setSpec]);

  return { loadInventory, fetchSpecAndLoadInventory };
}
