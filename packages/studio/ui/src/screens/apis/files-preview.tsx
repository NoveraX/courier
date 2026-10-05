import { FileCode2, FolderOpen } from "lucide-react";
import { useState } from "react";

import { CodeLines } from "@/design/code/code-lines";
import { tokenizeJsonLine } from "@/design/code/tokenize-json-line";
import { tokenizeLine } from "@/design/code/tokenize-line";
import { cn } from "@/lib/utils";
import type { GeneratedFile } from "@/views/apis/types";

function folderOf(paths: readonly string[]): string {
  const dirs = paths.map((path) => path.split("/").slice(0, -1));
  const first = dirs[0] ?? [];
  let shared = first.length;
  for (const dir of dirs) {
    let i = 0;
    while (i < shared && dir[i] === first[i]) i++;
    shared = i;
  }
  return shared ? `${first.slice(0, shared).join("/")}/` : "./";
}

/**
 * Generated files as the design previews them: the folder and its files,
 * each with its line count, on the left; the file picked, numbered and
 * coloured, on the right.
 *
 * @param props - The files
 * @returns The preview
 * @example
 * ```tsx
 * <FilesPreview files={state.generatedFiles} />
 * ```
 */
export function FilesPreview({ files }: { files: readonly GeneratedFile[] }): React.ReactNode {
  const [picked, setPicked] = useState(files[0]?.path ?? "");
  const folder = folderOf(files.map((f) => f.path));
  const file = files.find((f) => f.path === picked) ?? files[0];
  return (
    <div className="grid min-h-80 grid-cols-[200px_minmax(0,1fr)] gap-3">
      <section
        aria-label="Generated files"
        className="flex flex-col gap-px overflow-auto rounded-[11px] border border-line bg-inset p-2 font-mono text-small"
      >
        <span className="flex items-center gap-1.5 px-1.5 py-1.25 text-fg-subtle">
          <FolderOpen aria-hidden="true" className="size-3" />
          <span className="truncate">{folder}</span>
        </span>
        {files.map((f) => (
          <button
            key={f.path}
            type="button"
            aria-pressed={f.path === file?.path}
            title={f.path}
            onClick={() => setPicked(f.path)}
            className={cn(
              "flex h-7 shrink-0 cursor-pointer items-center gap-1.75 rounded-[6px] pr-2 pl-5.5 text-left hover:bg-raised",
              f.path === file?.path ? "bg-brand-dim text-fg" : "text-fg-muted",
            )}
          >
            <FileCode2 aria-hidden="true" className="size-3 shrink-0 text-fg-subtle" />
            <span className="min-w-0 flex-1 truncate">{f.path.slice(folder.length) || f.path}</span>
            <span className="text-micro text-ok">+{f.content.split("\n").length}</span>
          </button>
        ))}
      </section>
      <div className="max-h-105 overflow-auto rounded-[11px] border border-line bg-inset">
        {file && (
          <CodeLines
            code={file.content}
            tokenize={file.path.endsWith(".json") ? tokenizeJsonLine : tokenizeLine}
            variant="panel"
          />
        )}
      </div>
    </div>
  );
}
