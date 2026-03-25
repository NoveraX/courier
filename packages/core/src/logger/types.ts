export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(context: string, message: string, cause?: unknown): void;
  info(context: string, message: string, cause?: unknown): void;
  warn(context: string, message: string, cause?: unknown): void;
  error(context: string, message: string, cause?: unknown): void;
}
