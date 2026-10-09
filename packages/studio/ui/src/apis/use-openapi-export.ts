import { useCallback, useEffect, useState } from "react";

import {
  type OpenApiExport,
  type OpenApiExportRequest,
  readOpenApiDocument,
} from "@/features/apis/openapi-export";

/* A document is written again once typing in a field pauses this long. */
const TYPING_PAUSE_MS = 250;

export interface UseOpenApiExportReturn {
  open: boolean;
  request: OpenApiExportRequest;
  /** The document as last written, kept while the next one is written. */
  result: OpenApiExport | null;
  writing: boolean;
  error: string | null;
  /** Open the export on a source. */
  start: (source: string) => void;
  change: (patch: Partial<OpenApiExportRequest>) => void;
  close: () => void;
}

/**
 * The OpenAPI export's state: the source and how to write it, and the
 * document Studio wrote for them — written again whenever they change, once
 * typing pauses, the last answer winning.
 *
 * @returns The state and what changes it
 * @example
 * ```ts
 * const exporter = useOpenApiExport();
 * exporter.start("shop");
 * ```
 */
export function useOpenApiExport(): UseOpenApiExportReturn {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<OpenApiExportRequest>({
    source: "",
    openapi: "3.1.0",
    title: "",
    version: "",
  });
  const [result, setResult] = useState<OpenApiExport | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || request.source === "") return;
    let current = true;
    setWriting(true);
    const write = async () => {
      try {
        const written = await readOpenApiDocument(request);
        if (!current) return;
        setResult(written);
        setError(null);
      } catch (failure) {
        if (!current) return;
        setResult(null);
        setError(failure instanceof Error ? failure.message : String(failure));
      }
      setWriting(false);
    };
    const timer = setTimeout(() => void write(), TYPING_PAUSE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [open, request]);

  const start = useCallback((source: string) => {
    setRequest((previous) => ({ ...previous, source }));
    setResult(null);
    setError(null);
    setOpen(true);
  }, []);
  const change = useCallback((patch: Partial<OpenApiExportRequest>) => {
    setRequest((previous) => ({ ...previous, ...patch }));
  }, []);
  const close = useCallback(() => setOpen(false), []);

  return { open, request, result, writing, error, start, change, close };
}
