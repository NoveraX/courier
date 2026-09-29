import { configFileName } from "./config-file-name";
import type { ConfigStatusPayload } from "./config-status";
import type { MocksFileStatus } from "./mocks-file-status";

/** How a notice about the config is presented: one per kind of toast. */
export type ConfigNoticeTone = "error" | "success" | "info" | "warning";

/** What to tell the user when the config's status changes. */
export interface ConfigTransitionNotice {
  tone: ConfigNoticeTone;
  text: string;
}

/** A change to the API sources the watcher reported, in the server's time. */
export interface ApiSourceChange {
  files: readonly string[];
  timestamp: number;
}

/** What decides whether a reload of a config that kept loading is announced. */
export interface ConfigReloadContext {
  /** The latest change to the API sources the watcher reported, if any. */
  lastChange: ApiSourceChange | null;
  /** Whether reloads are announced at all: the `toastOnFileChange` setting. */
  announceReloads: boolean;
  /** The mocks file as `mocks:status` last told it, or `null` before it did. */
  mocks: MocksFileStatus | null;
}

type ConfigOutcome = Exclude<ConfigStatusPayload, { state: "starting" }>;

/**
 * What to tell the user when the config's status goes from `prev` to `next`,
 * or `null` when nothing is worth a toast. Only a newer outcome than one the
 * UI already saw is announced: the replay a UI gets when it connects, and the
 * first load's outcome, say nothing; the page and the status bar show them.
 *
 * - loaded → failed: an error with the loader's message;
 * - failed or missing → loaded: a success;
 * - anything else → missing: a warning that the config was deleted;
 * - loaded → loaded: the reload, with the files whose change caused it, only
 *   when reloads are announced and a change to the API sources was reported
 *   after the previous load (an edit Studio made itself reports none);
 * - failed → failed, missing → missing, missing → failed: nothing new to say.
 *
 * The mocks file is not an API source, though the watcher reports its saves
 * with them: a reload is announced without it, and not at all when it was
 * the only file that changed. While the mocks file does not load, no reload
 * is announced: that reload did not load the whole project, and a toast
 * saying it reloaded would read as if it had. The mocks file's own error is
 * not announced here; each mock it declared shows it as its last error.
 *
 * @param prev - The status the UI had, or `null` when it had none since connecting
 * @param next - The status Studio just sent
 * @param reload - The change behind a reload, whether reloads are announced, and how the mocks file loads
 * @returns The notice, or `null`
 *
 * @example
 * ```ts
 * configTransitionNotice(loaded, failed, { lastChange: null, announceReloads: true, mocks: null });
 * // → { tone: "error", text: "courier.config stopped loading: Unexpected token" }
 * ```
 */
export function configTransitionNotice(
  prev: ConfigStatusPayload | null,
  next: ConfigStatusPayload,
  reload: ConfigReloadContext,
): ConfigTransitionNotice | null {
  if (prev === null || prev.state === "starting" || next.state === "starting") return null;
  if (next.revision <= prev.revision) return null;
  const file = configFileName(next);
  switch (next.state) {
    case "missing":
      return prev.state === "missing" ? null : { tone: "warning", text: `${file} was deleted` };
    case "failed":
      if (prev.state !== "loaded") return null;
      return { tone: "error", text: `${file} stopped loading: ${next.error.message}` };
    case "loaded":
      return loadedNotice(prev, file, reload);
  }
}

function loadedNotice(
  prev: ConfigOutcome,
  file: string,
  { lastChange, announceReloads, mocks }: ConfigReloadContext,
): ConfigTransitionNotice | null {
  if (prev.state !== "loaded") {
    const again = prev.lastGoodAt === null ? "" : " again";
    return { tone: "success", text: `${file} loads${again}` };
  }
  if (!announceReloads || lastChange === null || lastChange.timestamp < prev.loadedAt) return null;
  if (mocks !== null && mocks.error !== null) return null;
  const files = lastChange.files.filter((changed) => changed !== mocks?.file);
  if (files.length === 0 && lastChange.files.length > 0) return null;
  return { tone: "info", text: `API sources reloaded${describeFiles(files)}` };
}

function describeFiles(files: readonly string[]): string {
  if (files.length === 0) return "";
  return ` — ${files.length === 1 ? files[0] : `${files.length} files`}`;
}
