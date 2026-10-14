import { useRef } from "react";

import { CODE_TONES } from "@/design/code/code-lines";
import { tokenizeJsoncLine } from "@/design/code/tokenize-jsonc-line";
import { toggleComment } from "@/features/playground/jsonc-helpers";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** What the text is, for assistive technology. */
  label: string;
}

const INDENT = "  ";

/* Tab indents, Shift+Tab outdents the line, ⌘/ or Ctrl+/ comments the lines out or back in. */
function edit(
  event: React.KeyboardEvent<HTMLTextAreaElement>,
  value: string,
): { text: string; start: number; end: number } | undefined {
  const { selectionStart: start, selectionEnd: end } = event.currentTarget;
  if ((event.metaKey || event.ctrlKey) && event.key === "/")
    return toggleComment(value, start, end);
  if (event.key !== "Tab") return undefined;
  if (!event.shiftKey) {
    const at = start + INDENT.length;
    return { text: `${value.slice(0, start)}${INDENT}${value.slice(end)}`, start: at, end: at };
  }
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  if (!value.startsWith(INDENT, lineStart)) return { text: value, start, end };
  const text = value.slice(0, lineStart) + value.slice(lineStart + INDENT.length);
  return {
    text,
    start: Math.max(lineStart, start - INDENT.length),
    end: Math.max(lineStart, end - INDENT.length),
  };
}

/**
 * The Playground's JSON editor: numbered lines, the text coloured as JSON
 * with comments, the caret in the brand colour. Tab indents, Shift+Tab
 * outdents, ⌘/ or Ctrl+/ comments lines out — a commented line is not sent. On a
 * touch screen its text is large enough that a phone does not zoom in on
 * it, and the keyboard leaves it as typed: no capitals, corrections or
 * curly quotes.
 *
 * @param props - The text, what changes it, and its label
 * @returns The editor
 * @example
 * ```tsx
 * <CodeEditor value={variables} onChange={setVariables} label="Variables" />
 * ```
 */
export function CodeEditor({ value, onChange, label }: CodeEditorProps): React.ReactNode {
  const area = useRef<HTMLTextAreaElement>(null);
  const lines = value.split("\n");
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const next = edit(event, value);
    if (!next) return;
    event.preventDefault();
    onChange(next.text);
    requestAnimationFrame(() => area.current?.setSelectionRange(next.start, next.end));
  };
  return (
    <div className="flex min-h-55 flex-[1_0_auto] bg-inset font-mono text-control leading-[1.7] pointer-coarse:text-[16px]">
      <pre
        aria-hidden="true"
        className="m-0 w-11 shrink-0 border-r border-line py-3.5 pr-3 text-right text-fg-subtle opacity-50 select-none"
      >
        {lines.map((_, index) => index + 1).join("\n")}
      </pre>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="relative w-max min-w-full">
          <pre
            aria-hidden="true"
            className="pointer-events-none m-0 px-4 py-3.5 whitespace-pre [tab-size:2]"
          >
            {lines.map((line, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a line's number is its identity while it is drawn
              <div key={index} className="min-h-[1.7em]">
                {tokenizeJsoncLine(line).map((token, at) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: tokens of one line, in order
                  <span key={at} className={CODE_TONES[token.tone]}>
                    {token.text}
                  </span>
                ))}
              </div>
            ))}
          </pre>
          <textarea
            ref={area}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={label}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="absolute inset-0 m-0 size-full resize-none overflow-hidden border-0 bg-transparent px-4 py-3.5 font-mono whitespace-pre text-transparent caret-brand outline-none [tab-size:2] [-webkit-text-fill-color:transparent] [font-variant-ligatures:none]"
          />
        </div>
      </div>
    </div>
  );
}
