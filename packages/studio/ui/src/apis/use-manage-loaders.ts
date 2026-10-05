/**
 * Load an import's endpoint inventory for the manage dialog, from a spec
 * given or fetched from the import's URL.
 */

import { useCallback } from "react";
import { fetchInventory, parseSpecFromUrl } from "@/apis/client";
import type { EndpointInventory, ManageStep, ParsedSpec } from "@/views/apis/types";

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

  const loadInventory = useCallback(
    async (name: string, parsedSpec: ParsedSpec) => {
      setStep("loading");
      setError(null);
      try {
        const inv = await fetchInventory(name, parsedSpec);
        setInventory(inv);
        setStep("inventory");
      } catch (err) {
        /* Back to the spec, where another one can be given: the error is said above it. */
        setError(err instanceof Error ? err.message : "Failed to load inventory");
        setStep("reupload");
      }
    },
    [setStep, setError, setInventory],
  );

  const fetchSpecAndLoadInventory = useCallback(
    async (name: string, specUrl: string) => {
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
    },
    [setStep, setError, setInventory, setSpec],
  );

  return { loadInventory, fetchSpecAndLoadInventory };
}
