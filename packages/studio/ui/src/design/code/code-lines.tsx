import { cn } from "@/lib/utils";
import type { CodeToken, CodeTone } from "./tokenize-line";
import { tokenizeLine } from "./tokenize-line";

/** The colour each role of a piece of code is written in. */
export const CODE_TONES: Readonly<Record<CodeTone, string>> = {
  keyword: "text-syntax-keyword",
  function: "text-syntax-function",
  string: "text-syntax-string",
  type: "text-syntax-type",
  number: "text-syntax-number",
  plain: "text-syntax-plain",
  punctuation: "text-fg-subtle",
  comment: "text-fg-subtle italic",
  space: "",
};

const HIGHLIGHTS = { brand: "bg-brand-tint", warn: "bg-warn-dim", ok: "bg-ok-dim" } as const;

/* A setup snippet reads at the size of the page; code in the inspector, a size down. */
const VARIANTS = {
  snippet: { pre: "pt-6 pb-6.5 text-control", line: "min-h-5.25", number: "opacity-55" },
  panel: { pre: "pt-2.5 pb-3 text-small", line: "min-h-5", number: "opacity-50" },
} as const;

interface CodeLinesProps {
  code: string;
  /** Whether a line, numbered from 1, is one to draw the eye to. */
  isHighlighted?: ((line: string, number: number) => boolean) | undefined;
  /** How a line splits into pieces to colour; TypeScript and shell by default. */
  tokenize?: ((line: string) => CodeToken[]) | undefined;
  variant?: keyof typeof VARIANTS | undefined;
  /** The ground of a highlighted line: a hint, a warning, or a fix. */
  highlight?: keyof typeof HIGHLIGHTS | undefined;
  /** The line, by its number, a search shows as its current match. */
  current?: number | undefined;
  /** Each line's number, where the lines are some of a longer text's; 1, 2, 3… by default. */
  numbers?: readonly number[] | undefined;
}

/**
 * Lines of code, numbered and coloured, the highlighted ones tinted.
 *
 * @param props - The code, which lines to tint, how to colour it, and its size
 * @returns The block
 * @example
 * ```tsx
 * <CodeLines code={snippet} isHighlighted={(line) => line.includes("courier")} />
 * ```
 */
export function CodeLines({
  code,
  isHighlighted,
  tokenize = tokenizeLine,
  variant = "snippet",
  highlight = "brand",
  current,
  numbers,
}: CodeLinesProps): React.ReactNode {
  const v = VARIANTS[variant];
  const numberOf = (index: number): number => numbers?.[index] ?? index + 1;
  /* A longer text's numbers run past four digits: the column widens to the longest. */
  const digits = numbers === undefined ? 0 : String(Math.max(0, ...numbers)).length;
  const column = digits > 4 ? { width: `calc(${digits}ch + 0.875rem)` } : undefined;
  return (
    <pre className={cn("overflow-auto leading-[1.7]", v.pre)}>
      {code.split("\n").map((line, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: a snippet's lines are fixed; the number is the line's identity
          key={index}
          data-line={numberOf(index)}
          aria-current={current === numberOf(index) ? "true" : undefined}
          className={cn(
            "flex",
            v.line,
            isHighlighted?.(line, numberOf(index)) && HIGHLIGHTS[highlight],
            current === numberOf(index) && "outline-1 -outline-offset-1 outline-brand",
          )}
        >
          <span
            className={cn("w-10 shrink-0 pr-3.5 text-right text-fg-subtle select-none", v.number)}
            style={column}
          >
            {numberOf(index)}
          </span>
          <span className="pr-4 whitespace-pre">
            {tokenize(line).map((token, at) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: tokens of a fixed line, in order
              <span key={at} className={CODE_TONES[token.tone]}>
                {token.text}
              </span>
            ))}
          </span>
        </div>
      ))}
    </pre>
  );
}
