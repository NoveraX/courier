import * as nodeModule from "node:module";
import { fileURLToPath } from "node:url";
import { MessageChannel } from "node:worker_threads";

/** How the files of the ES modules Node resolves are noted: on its loader's thread, or off it. */
export type ResolveHooks = "sync" | "async";

/** The files of the ES modules Node resolved, noted as it resolves them. */
export interface ResolvedFiles {
  /** Until every resolution so far is noted: those made off the thread arrive after it. */
  settled(): Promise<void>;
}

/* Hooks run on the loader's own thread, telling each file resolved over the port they are given. */
const ASYNC_HOOKS = `let port;
export function initialize(data) {
  port = data.port;
  port.on("message", (message) => { if (message === "flush") port.postMessage("flushed"); });
  port.unref();
}
export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  if (resolved.url.startsWith("file:")) port.postMessage(resolved.url);
  return resolved;
}
`;

/**
 * Note the file of every ES module Node resolves from now on, into a set:
 * with the synchronous hooks Node has from 22.15, as it resolves each one;
 * before, with hooks on the loader's own thread, whose notes arrive once
 * `settled()` resolves.
 *
 * @param noted - Where each file goes
 * @param hooks - Which hooks: the synchronous ones wherever Node has them
 * @returns How to wait for every note
 * @example
 * ```ts
 * const resolved = noteResolvedFiles(files);
 * await import(configUrl);
 * await resolved.settled(); // files now holds every module the import resolved
 * ```
 */
export function noteResolvedFiles(
  noted: Set<string>,
  hooks: ResolveHooks = typeof nodeModule.registerHooks === "function" ? "sync" : "async",
): ResolvedFiles {
  /* Read off the namespace, not imported by name: Node before 22.15 has no such
     export, and a named import of it would stop the module from loading at all. */
  if (hooks === "sync" && typeof nodeModule.registerHooks === "function") {
    nodeModule.registerHooks({
      resolve(specifier, context, nextResolve) {
        const resolved = nextResolve(specifier, context);
        if (resolved.url.startsWith("file:")) noted.add(fileURLToPath(resolved.url));
        return resolved;
      },
    });
    return { settled: () => Promise.resolve() };
  }
  return noteOffThread(noted);
}

function noteOffThread(noted: Set<string>): ResolvedFiles {
  const { port1, port2 } = new MessageChannel();
  const flushed: Array<() => void> = [];
  port1.on("message", (message: unknown) => {
    if (message === "flushed") flushed.shift()?.();
    else if (typeof message === "string") noted.add(fileURLToPath(message));
    if (flushed.length === 0) port1.unref();
  });
  port1.unref();
  nodeModule.register(`data:text/javascript,${encodeURIComponent(ASYNC_HOOKS)}`, {
    data: { port: port2 },
    transferList: [port2],
  });
  /* Messages on one port arrive in order: the reply to a flush comes after every note before it. */
  return {
    settled: () =>
      new Promise((resolve) => {
        flushed.push(resolve);
        port1.ref();
        port1.postMessage("flush");
      }),
  };
}
