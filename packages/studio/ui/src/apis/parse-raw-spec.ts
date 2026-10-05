import { parseSpecFromRaw } from "@/apis/client";
import type { ParsedSpec } from "@/views/apis/types";

/** A spec given again — typed, pasted or read from a file — and Studio's reading of it. */
export interface ReuploadState {
  content: string;
  parsing: boolean;
  error: string | null;
}

/**
 * Have Studio read a spec given as text, saying while it reads and why it
 * could not, and hand the spec on once read.
 *
 * @param content - The spec's text
 * @param onParsed - What takes the spec read
 * @param setState - Where the reading's progress and error go
 * @example
 * ```ts
 * await parseRawSpec(text, (spec) => manage.provideSpec(spec), update);
 * ```
 */
export async function parseRawSpec(
  content: string,
  onParsed: (spec: ParsedSpec) => void,
  setState: (update: Partial<ReuploadState>) => void,
): Promise<void> {
  setState({ parsing: true, error: null });
  try {
    onParsed(await parseSpecFromRaw(content));
  } catch (err) {
    setState({ error: err instanceof Error ? err.message : "Failed to parse spec" });
  } finally {
    setState({ parsing: false });
  }
}
