import type { AttachedApp } from "@/features/runtimes/attached-apps";
import { configFileName } from "@/store/config-file-name";
import type { ConfigStatusPayload } from "@/store/config-status";

/** One line of the capture panel's log, before a request arrives. */
export interface CaptureLogLine {
  /** When it happened, when Studio said so. */
  at: number | undefined;
  tag: "studio" | "config" | "watch" | "runtime";
  message: string;
}

/** What the panel knows of Studio while it waits for the first request. */
export interface CaptureLogState {
  host: string;
  config: ConfigStatusPayload | null;
  watched: number;
  apps: readonly AttachedApp[];
  /** When the first app now attached arrived. */
  attachedSince: number | undefined;
}

function configLine(config: ConfigStatusPayload | null): CaptureLogLine {
  const file = configFileName(config);
  if (config === null || config.state === "starting")
    return { at: undefined, tag: "config", message: `loading ${file}…` };
  if (config.state === "loaded")
    return { at: config.loadedAt, tag: "config", message: `${file} loaded` };
  if (config.state === "failed")
    return { at: config.failedAt, tag: "config", message: `${file} does not load` };
  return { at: undefined, tag: "config", message: `no ${file} in the project` };
}

/**
 * The log the capture panel shows until the first request: where Studio
 * serves, how the config loads, what it watches, and the apps attached —
 * or that it waits for one.
 *
 * @param state - What Studio has told the page
 * @returns The lines, oldest first
 * @example
 * ```ts
 * captureLog({ host: "localhost:6280", config: null, watched: 0, apps: [], attachedSince: undefined });
 * ```
 */
export function captureLog(state: CaptureLogState): CaptureLogLine[] {
  const lines: CaptureLogLine[] = [
    { at: undefined, tag: "studio", message: `serving on http://${state.host}` },
    configLine(state.config),
  ];
  if (state.watched > 0)
    lines.push({ at: undefined, tag: "watch", message: `watching ${state.watched} files` });
  if (state.apps.length === 0) {
    lines.push({ at: undefined, tag: "runtime", message: "waiting for an app to attach…" });
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
