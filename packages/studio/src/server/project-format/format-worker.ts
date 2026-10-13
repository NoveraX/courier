/**
 * The process Studio formats a project's files in, out of its server's own
 * so that no tool holds it up. It formats with the project's ESLint and
 * Prettier — each loaded once, from the project, and kept for every file
 * after, so a file takes milliseconds rather than a process of its own —
 * and a tool that fails, or takes too long and is stopped, leaves Studio
 * running. A process whose Studio has gone ends too.
 */

import type { FileFormatter } from "./tool-api";
import { eslintFormatter } from "./worker-eslint";
import { prettierFormatter } from "./worker-prettier";
import { type FormatReply, type FormatRequest, isFormatRequest } from "./worker-protocol";

const formatters = new Map<string, Promise<FileFormatter>>();

/* The tool, loaded on first use and kept; a tool that fails to load fails each file alike. */
function formatterFor({ tool, module, root }: FormatRequest): Promise<FileFormatter> {
  const key = `${tool}\u0000${module}\u0000${root}`;
  let formatter = formatters.get(key);
  if (formatter === undefined) {
    formatter = tool === "ESLint" ? eslintFormatter(module, root) : prettierFormatter(module, root);
    formatters.set(key, formatter);
  }
  return formatter;
}

/* A reply Studio is gone before it takes: this process has nothing left to do. */
function reply(message: FormatReply): void {
  process.send?.(message, (error: Error | null) => {
    if (error) process.exit(0);
  });
}

async function answer(request: FormatRequest): Promise<void> {
  try {
    const format = await formatterFor(request);
    reply({ id: request.id, text: await format(request.path, request.text) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    reply({ id: request.id, error: reason.split("\n")[0] ?? reason });
  }
}

process.on("message", (message: unknown) => {
  if (isFormatRequest(message)) void answer(message);
});
process.on("disconnect", () => process.exit(0));
