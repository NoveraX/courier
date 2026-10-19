import type { ProjectRoot } from "@noverax/courier-cli/devkit";
import type { ImportStateEntry } from "../../apis/imports-state";
import type { ImportLayout } from "../../apis/layout";
import { declaresEndpoints } from "../../apis/merge/declares-endpoints";
import { generateFingerprints } from "../../apis/merge/fingerprint";
import { claimedFiles } from "./claimed-files";
import type { PlanRequest } from "./file-plan-types";

/** What regenerating an import asks of its files, and what it leaves where it was. */
export interface RegenerationRequest {
  request: PlanRequest;
  /**
   * Files Studio recorded writing outside the import's directory as it is
   * declared now: written before the directory moved. They are left where
   * they are and forgotten.
   */
  leftBehind: string[];
}

/**
 * Ask for an import's files as freshly generated: each generated file is a
 * target, merged with the version on disk when it declares endpoints — a
 * renamed group's with the file its group was written to before — and
 * every file Studio recorded writing, or finds claimed by its header, in
 * the import's directory and not generated now, is a file no longer wanted.
 *
 * @param root - The project
 * @param layout - Where the import's files go
 * @param generated - The files generated for it
 * @param entry - What Studio recorded about the import, if anything
 * @param moved - The file on disk each renamed group's file is written from, by the file it is written to
 * @returns The request, and the recorded files left outside the directory
 * @example
 * ```ts
 * const { request } = regenerationRequest(root, layout, generateCode(spec, options, name), state);
 * ```
 */
export function regenerationRequest(
  root: ProjectRoot,
  layout: ImportLayout,
  generated: ReadonlyArray<{ path: string; content: string }>,
  entry: ImportStateEntry | undefined,
  moved: ReadonlyMap<string, string> = new Map(),
): RegenerationRequest {
  const inDir = (path: string): boolean => path.startsWith(`${layout.dir}/`);
  const recorded = Object.keys(entry?.files ?? {});
  const targetPaths = new Set(generated.map((file) => file.path));
  const candidates = new Set([
    ...recorded.filter(inDir),
    ...claimedFiles(root, layout.dir, layout.importName),
  ]);
  return {
    request: {
      importName: layout.importName,
      dir: layout.dir,
      targets: generated.map((file) => {
        const merges = declaresEndpoints(file.content);
        const from = merges ? moved.get(file.path) : undefined;
        return {
          path: file.path,
          body: file.content,
          kind: merges ? "merge" : "generated",
          endpoints: generateFingerprints(file.content),
          ...(from !== undefined && { mergeFrom: from }),
        };
      }),
      removals: [...candidates].filter((path) => !targetPaths.has(path)),
    },
    leftBehind: recorded.filter((path) => !inDir(path)),
  };
}
