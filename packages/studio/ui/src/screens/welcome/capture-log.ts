import type { AttachedApp } from "@/features/runtimes/attached-apps";
import { configFileName } from "@/store/config-file-name";
import type { ConfigStatusPayload } from "@/store/config-status";

/** One line of the capture panel's log, before a request arrives. */
export interface CaptureLogLine {
  /** When it happened, as Studio tells; unknown until it does. */
  at: number | undefined;
  tag: "studio" | "config" | "watch" | "runtime";
  message: string;
}

/** What the panel knows of Studio while it waits for the first request. */
export interface CaptureLogState {
  host: string;
  /** When Studio started. */
  startedAt: number | undefined;
  config: ConfigStatusPayload | null;
  watched: number;
  /** When Studio began to watch that many files. */
  watchedSince: number | undefined;
  apps: readonly AttachedApp[];
  /** When the first app now attached arrived. */
  attachedSince: number | undefined;
  /** When the last app left, while none is attached; before any came, Studio waits since its start. */
  idleSince: number | undefined;
}

function configLine(config: ConfigStatusPayload | null, startedAt?: number): CaptureLogLine {
  const file = configFileName(config);
  if (config === null || config.state === "starting")
    return { at: startedAt, tag: "config", message: `loading ${file}…` };
  if (config.state === "loaded")
    return { at: config.loadedAt, tag: "config", message: `${file} loaded` };
  if (config.state === "failed")
    return { at: config.failedAt, tag: "config", message: `${file} does not load` };
  return { at: config.missingAt, tag: "config", message: `no ${file} in the project` };
}

/**
 * The log the capture panel shows until the first request: where Studio
 * serves, how the config loads, what it watches, and the apps attached —
 * or that it waits for one — each at the time Studio gives for it.
 *
 * @param state - What Studio has told the page
 * @returns The lines, in that order
 * @example
 * ```ts
 * captureLog({
 *   host: "localhost:6280",
 *   startedAt: info.startedAt,
 *   config: null,
 *   watched: 0,
 *   watchedSince: undefined,
 *   apps: [],
 *   attachedSince: undefined,
 *   idleSince: undefined,
 * });
 * ```
 */
export function captureLog(state: CaptureLogState): CaptureLogLine[] {
  const lines: CaptureLogLine[] = [
    { at: state.startedAt, tag: "studio", message: `serving on http://${state.host}` },
    configLine(state.config, state.startedAt),
  ];
  if (state.watched > 0)
    lines.push({
      at: state.watchedSince,
      tag: "watch",
      message: `watching ${state.watched} files`,
    });
  if (state.apps.length === 0) {
    lines.push({
      at: state.idleSince ?? state.startedAt,
      tag: "runtime",
      message: "waiting for an app to attach…",
    });
  }
  for (const app of state.apps) {
    lines.push({
      at: state.attachedSince,
      tag: "runtime",
      message: `${app.id} attached · ${app.kind}`,
    });
  }
  return lines;
}
