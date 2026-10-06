/** A file the formatter thread is asked to run one tool on. */
export interface FormatRequest {
  id: number;
  /** The tool: ESLint applies its fixes, Prettier formats. */
  tool: "ESLint" | "Prettier";
  /** The module the project resolves the tool from. */
  module: string;
  /** The project root, where the tool finds its configuration. */
  root: string;
  /** The file's absolute path, which picks the configuration and the parser. */
  path: string;
  text: string;
}

/** What the formatter thread answers: the text as the tool leaves it, or why it could not. */
export type FormatReply = { id: number; text: string } | { id: number; error: string };

/**
 * Tell whether a message from the formatter thread is a reply.
 *
 * @param value - The message
 * @returns Whether it answers a request
 */
export function isFormatReply(value: unknown): value is FormatReply {
  if (typeof value !== "object" || value === null) return false;
  const id: unknown = Reflect.get(value, "id");
  const text: unknown = Reflect.get(value, "text");
  const error: unknown = Reflect.get(value, "error");
  return typeof id === "number" && (typeof text === "string" || typeof error === "string");
}

/**
 * Tell whether a message to the formatter thread is a request.
 *
 * @param value - The message
 * @returns Whether it asks for a file to be formatted
 */
export function isFormatRequest(value: unknown): value is FormatRequest {
  if (typeof value !== "object" || value === null) return false;
  const field = (key: string): unknown => Reflect.get(value, key);
  return (
    typeof field("id") === "number" &&
    (field("tool") === "ESLint" || field("tool") === "Prettier") &&
    ["module", "root", "path", "text"].every((key) => typeof field(key) === "string")
  );
}
