/**
 * Unified Nexus logger — premium formatting for browser and server.
 *
 * Browser: CSS-styled `%c` console output with brand colors.
 * Server:  ANSI escape codes with `[Nexus] PID – HH:MM:SS` prefix.
 *
 * @example
 * ```ts
 * import { logger } from "@noverax/nexus";
 * logger.warn("HttpClient", "Cache option ignored with onUploadProgress");
 * ```
 */

export { createLogger, logger } from "./logger/index";
export type { Logger, LogLevel } from "./logger/types";
