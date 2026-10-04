/** How log lines are written, and the raw value when it was not one Courier knows. */
export interface LogFormat {
  /** One JSON object per line, rather than text for a person. */
  readonly json: boolean;
  readonly unrecognised?: string;
}

/**
 * The format `COURIER_LOG_FORMAT` sets: `text` (the default) or `json`, in
 * any case.
 *
 * Read on every line, as the level is, so a value set in the app's entry
 * module applies.
 *
 * @returns The format; an unknown value keeps `text` and is reported back
 * @example
 * ```ts
 * if (readLogFormat().json) console.info(jsonLine("info", "Server", "ready"));
 * ```
 */
export function readLogFormat(): LogFormat {
  const raw = globalThis.process?.env?.COURIER_LOG_FORMAT;
  if (raw === undefined) return { json: false };
  const value = raw.trim().toLowerCase();
  if (value === "" || value === "text") return { json: false };
  if (value === "json") return { json: true };
  return { json: false, unrecognised: raw };
}
