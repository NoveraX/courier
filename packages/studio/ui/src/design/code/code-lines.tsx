import { cn } from "@/lib/utils";
import type { CodeTone } from "./tokenize-line";
import { tokenizeLine } from "./tokenize-line";

const TONES: Readonly<Record<CodeTone, string>> = {
  keyword: "text-syntax-keyword",
  function: "text-syntax-function",
  string: "text-syntax-string",
  type: "text-syntax-type",
  plain: "text-syntax-plain",
  punctuation: "text-fg-subtle",
  space: "",
};

interface CodeLinesProps {
  code: string;
  /** Whether a line, numbered from 1, is one the reader is asked to add. */
  isHighlighted?: ((line: string, number: number) => boolean) | undefined;
}

/**
 * Lines of code, numbered and coloured, the highlighted ones tinted.
 *
 * @param props - The code, and which lines to tint
 * @returns The block
 * @example
 * ```tsx
 * <CodeLines code={snippet} isHighlighted={(line) => line.includes("courier")} />
 * ```
 */
export function CodeLines({ code, isHighlighted }: CodeLinesProps): React.ReactNode {
  return (
    <pre className="overflow-auto pt-3 pb-3.5 text-control leading-[1.7]">
      {code.split("\n").map((line, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: a snippet's lines are fixed; the number is the line's identity
          key={index}
          className={cn("flex min-h-5.25", isHighlighted?.(line, index + 1) && "bg-brand-tint")}
        >
          <span className="w-10 shrink-0 pr-3.5 text-right text-fg-subtle opacity-55 select-none">
            {index + 1}
          </span>
          <span className="pr-4 whitespace-pre">
            {tokenizeLine(line).map((token, at) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: tokens of a fixed line, in order
              <span key={at} className={TONES[token.tone]}>
                {token.text}
              </span>
            ))}
          </span>
        </div>
      ))}
    </pre>
  );
}
