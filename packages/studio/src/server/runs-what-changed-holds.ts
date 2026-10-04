import type { LoadedCourierConfig } from "./config-loader";
import { holdsEvaluatedText } from "./evaluated-on-disk";

/**
 * Whether Studio already runs what every changed file holds: each is a
 * module the running load evaluated, and holds the text it evaluated. A save
 * that leaves a file as it was — an editor saving it unchanged, an edit
 * undone before the reload ran — then reloads nothing. A file the load did
 * not evaluate itself, such as JSON or a `tsconfig`, always reloads, and so
 * does the config or the mocks file when the load could not tell what it
 * held: the next load records it, for an edit to compare the file with.
 *
 * @param running - The load Studio runs, or `null` while it runs none
 * @param changed - The files reported changed
 * @returns Whether reloading would evaluate exactly what runs
 * @example
 * ```ts
 * if (runsWhatChangedHolds(current(), ["/app/src/api.ts"])) return; // nothing to load
 * ```
 */
export function runsWhatChangedHolds(
  running: LoadedCourierConfig | null,
  changed: readonly string[],
): boolean {
  if (running === null || changed.length === 0) return false;
  const unknown = new Set(contentUnknown(running));
  return changed.every((path) => {
    const text = running.evaluated.get(path);
    return !unknown.has(path) && text !== undefined && holdsEvaluatedText(path, text);
  });
}

/* The config or the mocks file, when the load could not tell what it held:
   reloaded, so the next load can — an edit compares the file with it. */
function contentUnknown(running: LoadedCourierConfig): string[] {
  const { configFile, contentHash, mocks } = running;
  return [
    ...(contentHash === null ? [configFile] : []),
    ...(mocks.file !== null && mocks.contentHash === null ? [mocks.file] : []),
  ];
}
