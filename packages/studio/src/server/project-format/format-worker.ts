/**
 * The thread Studio does its long work in, out of its server's own thread
 * so that no single piece of it holds the server up. It formats files with
 * the project's ESLint and Prettier — each loaded once, from the project,
 * and kept for every file after, so a file takes milliseconds rather than a
 * process of its own — and it reads specifications, generates their code
 * and compares them, one job per thread. It greets Studio first with the
 * version of what it understands, so a script left from another build of
 * Studio is told apart at once.
 */

import { parentPort } from "node:worker_threads";
import { serveSpecJobs } from "../spec-thread/serve-spec-jobs";
import type { FileFormatter } from "./tool-api";
import { eslintFormatter } from "./worker-eslint";
import { prettierFormatter } from "./worker-prettier";
import { type FormatRequest, isFormatRequest } from "./worker-protocol";

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

async function answer(request: FormatRequest): Promise<void> {
  try {
    const format = await formatterFor(request);
    parentPort?.postMessage({ id: request.id, text: await format(request.path, request.text) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    parentPort?.postMessage({ id: request.id, error: reason.split("\n")[0] ?? reason });
  }
}

parentPort?.on("message", (message: unknown) => {
  if (isFormatRequest(message)) void answer(message);
});
serveSpecJobs(parentPort);
