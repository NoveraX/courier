import { ConfigurationError } from "../errors/configuration-error";
import type { HandlerConfig } from "./handler-config";

/* The longest wait a timer takes as given (2^31 - 1 ms, nearly 25 days). */
const MAX_WAIT_MS = 2_147_483_647;
const UPLOAD_MODES: ReadonlySet<unknown> = new Set(["auto", "memory", "stream"]);

/**
 * Refuse, where the handler is made, options for request bodies that could
 * not work as written: an upload mode it does not have, a byte count or a
 * part count that is not a whole number, a wait that is not one a timer can
 * keep, or an upload folder that names none.
 *
 * @param config - The handler's options
 * @param where - What the handler is, named in the error
 * @throws ConfigurationError `BODY_OPTIONS_INVALID`
 * @example
 * ```ts
 * assertBodyOptions({ uploadMode: "memory", bodyIdleTimeoutMs: 10_000 }, "createHandler");
 * ```
 */
export function assertBodyOptions(config: HandlerConfig | undefined, where: string): void {
  const problem = config === undefined ? undefined : bodyOptionsProblem(config);
  if (problem !== undefined) {
    throw new ConfigurationError("BODY_OPTIONS_INVALID", `${where}: ${problem}`);
  }
}

function bodyOptionsProblem(config: HandlerConfig): string | undefined {
  const { uploadMode, uploadDirectory, maxUploadParts } = config;
  if (uploadMode !== undefined && !UPLOAD_MODES.has(uploadMode)) {
    return `uploadMode is "auto", "memory" or "stream"; got ${String(uploadMode)}`;
  }
  for (const key of [
    "uploadMemoryBytes",
    "totalUploadMemoryBytes",
    "totalUploadDiskBytes",
  ] as const) {
    const bytes = config[key];
    if (bytes !== undefined && !wholeNumber(bytes, 0)) {
      return `${key} is a whole number of bytes, 0 or more; got ${String(bytes)}`;
    }
  }
  if (
    uploadDirectory !== undefined &&
    (typeof uploadDirectory !== "string" || uploadDirectory === "")
  ) {
    return "uploadDirectory names a folder";
  }
  if (maxUploadParts !== undefined && !wholeNumber(maxUploadParts, 1)) {
    return `maxUploadParts is a whole number of parts, 1 or more; got ${String(maxUploadParts)}`;
  }
  for (const key of ["bodyIdleTimeoutMs", "bodyTimeoutMs"] as const) {
    const wait = config[key];
    if (wait !== undefined && !(wholeNumber(wait, 1) && wait <= MAX_WAIT_MS)) {
      return `${key} is a whole number of milliseconds from 1 to ${MAX_WAIT_MS}; got ${String(wait)}`;
    }
  }
  return undefined;
}

function wholeNumber(value: unknown, least: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= least;
}
