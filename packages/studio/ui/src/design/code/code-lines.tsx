import { useRef } from "react";

import { EVERY_ROW_UP_TO, useRowWindow } from "@/hooks/use-row-window";
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

/* A setup snippet reads at the size of the page; code in the inspector, a size down. A line's
   height, until one is drawn, is the size's line height: 1.7 times the font's. */
const VARIANTS = {
  snippet: {
    pre: "pt-6 pb-6.5 text-control",
    line: "min-h-5.25",
    number: "opacity-55",
    height: 21.25,
  },
  panel: { pre: "pt-2.5 pb-3 text-small", line: "min-h-5", number: "opacity-50", height: 20.4 },
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
 * Lines of code, numbered and coloured, the highlighted ones tinted. A
 * long text — a large answer in the raw view — draws the lines its pane
 * shows and a few either side, the current match among them wherever the
 * pane is scrolled, in a block as wide as its longest line.
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
  const lines = code.split("\n");
  const numberOf = (index: number): number => numbers?.[index] ?? index + 1;
  /* A longer text's numbers run past four digits: the column widens to the longest. */
  const digits = String(numbers === undefined ? lines.length : Math.max(0, ...numbers)).length;
  const column = digits > 4 ? { width: `calc(${digits}ch + 0.875rem)` } : undefined;
  const currentAt = current === undefined ? -1 : (numbers?.indexOf(current) ?? current - 1);
  const listRef = useRef<HTMLDivElement | null>(null);
  const { rowHeight, indexes } = useRowWindow({
    listRef,
    count: lines.length,
    estimate: v.height,
    kept: [currentAt],
  });
  const line = (index: number, top?: number) => {
    const text = lines[index] ?? "";
    const number = numberOf(index);
    return (
      <div
        key={index}
        data-line={number}
        aria-current={current === number ? "true" : undefined}
        className={cn(
          "flex",
          v.line,
          isHighlighted?.(text, number) && HIGHLIGHTS[highlight],
          current === number && "outline-1 -outline-offset-1 outline-brand",
          top !== undefined && "absolute inset-x-0",
        )}
        style={top === undefined ? undefined : { top }}
      >
        <span
          className={cn("w-10 shrink-0 pr-3.5 text-right text-fg-subtle select-none", v.number)}
          style={column}
        >
          {number}
        </span>
        <span className="pr-4 whitespace-pre">
          {tokenize(text).map((token, at) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: tokens of a fixed line, in order
            <span key={at} className={CODE_TONES[token.tone]}>
              {token.text}
            </span>
          ))}
        </span>
      </div>
    );
  };
  return (
    <pre className={cn("overflow-auto leading-[1.7]", v.pre)}>
      {lines.length <= EVERY_ROW_UP_TO ? (
        lines.map((_, index) => line(index))
      ) : (
        <div
          ref={listRef}
          className="relative"
          style={{ height: lines.length * rowHeight, minWidth: widthOf(lines, column) }}
        >
          {indexes.map((index) => line(index, index * rowHeight))}
        </div>
      )}
    </pre>
  );
}

/* As wide as the longest line, its number's column and the space after it, so the block scrolls
   sideways as far whichever lines are drawn: the font is fixed-width. */
function widthOf(lines: readonly string[], column: { width: string } | undefined): string {
  const longest = lines.reduce((most, text) => Math.max(most, text.length), 0);
  return `calc(${column?.width ?? "2.5rem"} + ${longest}ch + 1rem)`;
}
