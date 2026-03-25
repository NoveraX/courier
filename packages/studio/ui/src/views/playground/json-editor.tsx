import { useRef, useCallback } from "react";
import { WandSparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStudioStore } from "@/store";

// ── Types ──────────────────────────────────────────────────────────────────

interface JsonEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export function JsonEditor({ value, onChange, placeholder, className }: JsonEditorProps): React.ReactElement {
  const jsonIndent = useStudioStore((s) => s.settings.jsonIndent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isValid = isValidJsonc(value);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;

    // Cmd+/ or Ctrl+/ → toggle line comment
    if ((e.metaKey || e.ctrlKey) && e.key === "/") {
      e.preventDefault();
      const { text, start, end } = toggleComment(value, ta.selectionStart, ta.selectionEnd);
      onChange(text);
      requestAnimationFrame(() => { ta.selectionStart = start; ta.selectionEnd = end; });
      return;
    }

    if (e.key !== "Tab") return;
    e.preventDefault();
    const { selectionStart: start, selectionEnd: end } = ta;

    if (e.shiftKey) {
      const before = value.slice(0, start);
      const lineStart = before.lastIndexOf("\n") + 1;
      if (value.slice(lineStart, lineStart + 2) === "  ") {
        const next = value.slice(0, lineStart) + value.slice(lineStart + 2);
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = Math.max(start - 2, lineStart);
          ta.selectionEnd = Math.max(end - 2, lineStart);
        });
      }
    } else {
      const next = value.slice(0, start) + "  " + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => { ta.selectionStart = start + 2; ta.selectionEnd = start + 2; });
    }
  }, [value, onChange]);

  return (
    <div className={cn("relative flex flex-col", className)}>
      {/* Highlight overlay */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 overflow-auto rounded-md border px-3 py-2",
          "font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all",
          isValid ? "border-border-subtle" : "border-rose-500/30",
        )}
      >
        {value ? highlightJsonc(value) : (
          <span className="text-muted-foreground/30">{placeholder}</span>
        )}
      </div>

      {/* Transparent textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={!value ? placeholder : undefined}
        spellCheck={false}
        className={cn(
          "min-h-0 flex-1 resize-none rounded-md border bg-background-inset px-3 py-2",
          "font-mono text-[12px] leading-relaxed text-transparent caret-foreground",
          "placeholder:text-transparent",
          "focus:outline-none focus:ring-1 focus:ring-accent-brand/50",
          isValid ? "border-border-subtle" : "border-rose-500/30",
        )}
      />

      {/* Actions */}
      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
        {!isValid && value.trim() !== "{}" && (
          <span className="mr-1 text-[10px] text-rose-400/70">Invalid JSON</span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Prettify JSON"
              className="size-5 text-muted-foreground/40 hover:text-foreground"
              onClick={() => { try { onChange(JSON.stringify(JSON.parse(stripComments(value)), null, jsonIndent)); } catch { /* skip */ } }}
            >
              <WandSparkles className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Prettify</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ── JSONC helpers (JSON with comments) ──────────────────────────────────────

/** Strip // comments from JSONC text */
export function stripComments(text: string): string {
  return text.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1");
}

/** Validate JSONC — strips comments before parsing */
function isValidJsonc(str: string): boolean {
  try { JSON.parse(stripComments(str)); return true; } catch { return false; }
}

// ── Toggle comment ──────────────────────────────────────────────────────────

function toggleComment(
  text: string, selStart: number, selEnd: number,
): { text: string; start: number; end: number } {
  const lines = text.split("\n");
  const startLine = text.slice(0, selStart).split("\n").length - 1;
  const endLine = text.slice(0, selEnd).split("\n").length - 1;

  const allCommented = lines.slice(startLine, endLine + 1)
    .every((l) => l.trimStart().startsWith("//"));

  let offset = 0;
  for (let i = startLine; i <= endLine; i++) {
    if (allCommented) {
      // Uncomment: remove `// ` or `//`
      const idx = lines[i].indexOf("//");
      if (idx === -1) continue;
      const hasSpace = lines[i][idx + 2] === " ";
      const removed = hasSpace ? 3 : 2;
      lines[i] = lines[i].slice(0, idx) + lines[i].slice(idx + removed);
      if (i === startLine) offset -= removed;
    } else {
      const indent = lines[i].match(/^(\s*)/)?.[1] ?? "";
      lines[i] = `${indent}// ${lines[i].slice(indent.length)}`;
      if (i === startLine) offset += 3;
    }
  }

  return { text: lines.join("\n"), start: selStart + offset, end: selEnd + offset };
}

// ── JSONC syntax highlighting ───────────────────────────────────────────────

const JSONC_PATTERNS: [RegExp, string][] = [
  [/\/\/.*$/gm, "text-zinc-600 italic"],                // comments (dimmed)
  [/"(?:[^"\\]|\\.)*"\s*(?=:)/g, "text-cyan-400"],      // property keys
  [/"(?:[^"\\]|\\.)*"/g, "text-emerald-400"],            // string values
  [/\b-?\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, "text-sky-400"], // numbers
  [/\b(?:true|false|null)\b/g, "text-amber-400"],        // keywords
];

function highlightJsonc(code: string): React.ReactNode[] {
  const matches: { start: number; end: number; cls: string }[] = [];

  for (const [regex, cls] of JSONC_PATTERNS) {
    regex.lastIndex = 0;
    for (const m of code.matchAll(regex)) {
      matches.push({ start: m.index, end: m.index + m[0].length, cls });
    }
  }

  matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  const nodes: React.ReactNode[] = [];
  let pos = 0;
  let key = 0;

  for (const m of matches) {
    if (m.start < pos) continue;
    if (m.start > pos) nodes.push(code.slice(pos, m.start));
    nodes.push(<span key={key++} className={m.cls}>{code.slice(m.start, m.end)}</span>);
    pos = m.end;
  }

  if (pos < code.length) nodes.push(code.slice(pos));
  return nodes;
}
