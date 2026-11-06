import type * as NodeFs from "node:fs";
import type * as NodeOs from "node:os";
import type * as NodePath from "node:path";

/** The parts of Node an upload's files are kept on disk with. */
export interface NodeDisk {
  readonly fs: typeof NodeFs;
  readonly os: typeof NodeOs;
  readonly path: typeof NodePath;
}

let found: NodeDisk | null | undefined;

/**
 * Node's file system, where the runtime has one an upload's files can be
 * kept on and read back from as a `Blob` — Node from 22.3 on, and the
 * runtimes that offer Node's modules.
 *
 * The modules are taken with `process.getBuiltinModule`, Node's own way for
 * code that runs elsewhere too to reach them: nothing imports them, so a
 * bundle built for an edge runtime or a page has none to resolve, and there
 * the answer is that there is no disk.
 *
 * @returns The modules, or `undefined` where there is no such file system
 *
 * @example
 * ```ts
 * const disk = nodeDisk();
 * const store = disk ? diskStore({ disk, directory: disk.os.tmpdir(), ... }) : memoryStore(65_536);
 * ```
 */
export function nodeDisk(): NodeDisk | undefined {
  if (found === undefined) found = lookUp() ?? null;
  return found ?? undefined;
}

/* Off globalThis: Next.js refuses to build a read of the global `process` into a middleware. */
function lookUp(): NodeDisk | undefined {
  const node = globalThis.process;
  if (typeof node?.getBuiltinModule !== "function") return undefined;
  const fs = node.getBuiltinModule("node:fs");
  if (typeof fs?.openAsBlob !== "function") return undefined;
  return {
    fs,
    os: node.getBuiltinModule("node:os"),
    path: node.getBuiltinModule("node:path"),
  };
}
