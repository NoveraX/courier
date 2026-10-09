import { useEffect } from "react";

import { useImportRequest } from "@/features/apis/import-request";
import type { ImportSource } from "@/features/apis/types-generate";
import { useKeptImport } from "./kept-import";

/**
 * Open the import wizard with a specification another view asked for — one
 * read from a source's traffic — once the page may import: it opens on the
 * raw text, as though it were pasted, and the ask is taken.
 *
 * @param openWizard - Opens the wizard on a source, resuming what is kept for it
 * @param allowed - Whether the page may import now
 * @example
 * ```ts
 * useAskedImport(wizard.openWizard, page.importBlocked === null);
 * ```
 */
export function useAskedImport(
  openWizard: (source?: ImportSource) => void,
  allowed: boolean,
): void {
  const request = useImportRequest((s) => s.request);
  useEffect(() => {
    if (!request || !allowed) return;
    useKeptImport.setState({
      kept: { source: "raw", content: request.content, fromTraffic: request.fromTraffic },
    });
    openWizard("raw");
    useImportRequest.setState({ request: null });
  }, [request, allowed, openWizard]);
}
