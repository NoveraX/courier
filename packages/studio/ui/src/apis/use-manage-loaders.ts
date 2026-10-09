/**
 * Load an import's endpoint inventory for the manage dialog, from a spec
 * given, fetched from the import's URL, or read again from the traffic an
 * import declared from traffic was read from.
 */

import { useCallback } from "react";
import { fetchInventory, parseSpecFromRaw, parseSpecFromUrl } from "@/apis/client";
import type { EndpointInventory, ManageStep, ParsedSpec } from "@/features/apis/types";
import { readTrafficDocument } from "@/features/explorer/traffic-document";

interface LoaderDeps {
  setStep: (step: ManageStep) => void;
  setError: (error: string | null) => void;
  setInventory: (inventory: EndpointInventory | null) => void;
  setSpec: (spec: ParsedSpec | null) => void;
}

/** Each loads the inventory and says whether it did; one that did not says why above the spec. */
interface InventoryLoaders {
  loadInventory: (name: string, parsedSpec: ParsedSpec) => Promise<boolean>;
  fetchSpecAndLoadInventory: (name: string, specUrl: string) => Promise<boolean>;
  readTrafficAndLoadInventory: (name: string) => Promise<boolean>;
}

export function useInventoryLoaders(deps: LoaderDeps): InventoryLoaders {
  const { setStep, setError, setInventory, setSpec } = deps;

  /* The inventory of the spec `read` gives; back to the spec, where another can be given, when it fails. */
  const load = useCallback(
    async (name: string, read: () => Promise<ParsedSpec>, failure: string) => {
      setStep("loading");
      setError(null);
      try {
        const parsedSpec = await read();
        setSpec(parsedSpec);
        setInventory(await fetchInventory(name, parsedSpec));
        setStep("inventory");
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : failure);
        setStep("reupload");
        return false;
      }
    },
    [setStep, setError, setInventory, setSpec],
  );

  const loadInventory = useCallback(
    (name: string, parsedSpec: ParsedSpec) =>
      load(name, async () => parsedSpec, "Failed to load inventory"),
    [load],
  );
  const fetchSpecAndLoadInventory = useCallback(
    (name: string, specUrl: string) =>
      load(name, () => parseSpecFromUrl(specUrl), "Failed to fetch spec"),
    [load],
  );
  const readTrafficAndLoadInventory = useCallback(
    (name: string) =>
      load(
        name,
        async () => parseSpecFromRaw((await readTrafficDocument(name)).text),
        `Failed to read ${name} from its traffic`,
      ),
    [load],
  );

  return { loadInventory, fetchSpecAndLoadInventory, readTrafficAndLoadInventory };
}
