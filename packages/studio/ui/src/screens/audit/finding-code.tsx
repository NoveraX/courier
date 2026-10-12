import { Copy, FileCode } from "lucide-react";

import { CodeLines } from "@/design/code/code-lines";
import { isFixLine } from "@/features/audit/code-focus";
import { copyToClipboard } from "@/lib/clipboard";

/**
 * A finding's suggested code: numbered and coloured, the lines that make
 * the fix drawn out, with a button that copies it.
 *
 * @param props - The code
 * @returns The block
 * @example
 * ```tsx
 * <FindingCode code={item.codeSuggestion} />
 * ```
 */
export function FindingCode({ code }: { code: string }): React.ReactNode {
  const shown = code.replace(/\n+$/, "");
  return (
    <div className="max-w-190 overflow-hidden rounded-panel border border-line bg-inset">
      <div className="flex h-8 items-center gap-2 border-b border-line pr-1.5 pl-3 font-mono text-badge text-fg-subtle pointer-coarse:h-11">
        <FileCode aria-hidden="true" className="size-3" />
        Suggested fix
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void copyToClipboard(shown, "snippet")}
          className="flex h-5.5 cursor-pointer items-center gap-1.25 rounded-[5px] px-2 text-badge text-fg-subtle hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:h-9 pointer-coarse:px-3"
        >
          <Copy aria-hidden="true" className="size-2.75" />
          Copy
        </button>
      </div>
      <CodeLines code={shown} isHighlighted={isFixLine} variant="panel" highlight="ok" />
    </div>
  );
}
