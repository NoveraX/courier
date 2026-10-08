import type { JSONSchema } from "@noverax/courier/openapi";

import { isRecord } from "../is-record";
import type { ToolOutcome } from "./run-tool";

/** How a revision carries a call's answer as data, beside its text. */
export type StructuredOutput = "any" | "object" | "none";

const NO_CONTENT = "The call succeeded; the API answered with no content.";

/**
 * A tool call's result: the answer as text for the model, and as data for a
 * client that reads it — under a revision that carries it, for a tool
 * whose output schema it was shown.
 *
 * An answer longer than a model should be handed is refused rather than
 * cut: half a JSON document reads as a whole one.
 *
 * @param outcome - What came of the call
 * @param outputSchema - The output schema the client was shown for the tool, if any
 * @param structured - Whether the revision carries any data, an object alone, or none
 * @param maxChars - The longest answer handed to a model, in characters
 * @returns The `CallToolResult`'s fields
 * @example
 * ```ts
 * toolResult({ ok: true, data: { id: "7" } }, schema, "any", 100_000);
 * ```
 */
export function toolResult(
  outcome: ToolOutcome,
  outputSchema: JSONSchema | undefined,
  structured: StructuredOutput,
  maxChars: number,
): Record<string, unknown> {
  if (!outcome.ok) return failed(outcome.message);
  const binary = binaryText(outcome.data);
  if (binary !== undefined) return { content: [{ type: "text", text: binary }], isError: false };
  const json = jsonOf(outcome.data);
  const text =
    json === undefined ? NO_CONTENT : typeof json === "string" ? json : JSON.stringify(json);
  if (text.length > maxChars) {
    return failed(
      `The answer is ${text.length} characters, more than the ${maxChars} this server hands a model: ` +
        "ask for less of it — a page, a filter, fewer fields.",
    );
  }
  const carried =
    outputSchema !== undefined &&
    (structured === "any" || (structured === "object" && isRecord(json)));
  return {
    content: [{ type: "text", text }],
    ...(carried && json !== undefined && { structuredContent: json }),
    isError: false,
  };
}

function failed(message: string): Record<string, unknown> {
  return { content: [{ type: "text", text: message }], isError: true };
}

/* The answer as JSON holds it — a Date as its string — or `undefined` for none at all. */
function jsonOf(data: unknown): unknown {
  if (data === undefined || data === null || data === "") return undefined;
  const text = JSON.stringify(data);
  return text === undefined ? undefined : JSON.parse(text);
}

/* Bytes are described rather than passed on: a model reads text, and a file can be any size. */
function binaryText(data: unknown): string | undefined {
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return `The API answered with a file of ${data.size} bytes${data.type ? ` (${data.type})` : ""}, which this tool does not hand to a model.`;
  }
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return `The API answered with ${data.byteLength} bytes, which this tool does not hand to a model.`;
  }
  if (typeof ReadableStream !== "undefined" && data instanceof ReadableStream) {
    return "The API answered with a stream, which this tool does not hand to a model.";
  }
  return undefined;
}
