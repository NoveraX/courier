import { useEffect, useState } from "react";

import { previewLayout } from "./client";

/** What the wizard shows about where an import's files go. */
export interface ImportLayoutHint {
  /** The directory Studio would write, once it answered. */
  dir?: string;
  /** Why Studio refuses the directory or the name, if it does. */
  error?: string;
}

/* Long enough that typing a path asks once, not once per key. */
const SETTLE_MS = 200;

/**
 * Ask Studio, as the options settle, where an import's files would go. The
 * answer comes from the same layout Studio writes with, so the wizard never
 * shows a directory the write would not use.
 *
 * @param outputDir - The output directory as typed
 * @param sourceName - The source name as typed, which also names the import
 * @returns The directory, or the reason it is refused, once Studio answered
 *   for these options; neither while it has not
 * @example
 * ```tsx
 * const { dir, error } = useImportLayout(options.outputDir, options.sourceName);
 * ```
 */
export function useImportLayout(outputDir: string, sourceName: string): ImportLayoutHint {
  const [hint, setHint] = useState<ImportLayoutHint>({});

  useEffect(() => {
    let current = true;
    /* An answer for the previous options would name the wrong directory. */
    setHint({});
    const timer = setTimeout(async () => {
      const next = await ask(outputDir, sourceName);
      if (current) setHint(next);
    }, SETTLE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [outputDir, sourceName]);

  return hint;
}

async function ask(outputDir: string, sourceName: string): Promise<ImportLayoutHint> {
  try {
    const layout = await previewLayout(outputDir, sourceName);
    return { dir: layout.dir };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
