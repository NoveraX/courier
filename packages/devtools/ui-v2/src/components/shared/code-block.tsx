import { useEffect, useState } from "react";
import { codeToHtml, type BundledTheme } from "shiki";

import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/shared/copy-button";
import { highlightLine } from "@/views/timeline/tabs/syntax-highlight";

// ── Format switcher ─────────────────────────────────────────────────────────

export interface FormatOption {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function FormatSwitcher({ formats, active, onChange }: {
  formats: FormatOption[];
  active: string;
  onChange: (key: string) => void;
}): React.ReactElement {
  return (
    <div className="inline-flex items-center gap-px rounded-lg border border-border-subtle bg-muted/60 p-0.5">
      {formats.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onChange(f.key)}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all",
            active === f.key
              ? "bg-background text-foreground shadow-sm ring-1 ring-border-subtle"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50",
          )}
        >
          <f.icon className="size-2.5" />
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ── Shiki languages ──────────────────────────────────────────────────────────

const SHIKI_LANGS = new Set(["ts", "tsx", "js", "jsx", "typescript", "javascript", "json"]);
const SHIKI_THEME: BundledTheme = "github-dark-default";

// ── Code block ──────────────────────────────────────────────────────────────

export function CodeBlock({ code, language }: {
  code: string;
  language: string;
}): React.ReactElement {
  if (SHIKI_LANGS.has(language)) {
    return <ShikiCodeBlock code={code} language={language} />;
  }
  return <RegexCodeBlock code={code} language={language} />;
}

// ── Shiki-powered block ─────────────────────────────────────────────────────

function ShikiCodeBlock({ code, language }: {
  code: string;
  language: string;
}): React.ReactElement {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    codeToHtml(code, {
      lang: language,
      theme: SHIKI_THEME,
    }).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => { cancelled = true; };
  }, [code, language]);

  return (
    <div className="shiki-block relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="absolute right-2 top-2 z-10">
        <CopyButton value={code} label={`Copy ${language}`} />
      </div>
      {html ? (
        <div
          className="max-h-72 overflow-auto [&_pre]:bg-transparent! [&_pre]:py-3 [&_pre]:px-3 [&_code]:mono-sm [&_code]:leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className="space-y-2 py-4 px-3">
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-zinc-800" />
          <div className="h-3.5 w-1/2 animate-pulse rounded bg-zinc-800/70" />
          <div className="h-3.5 w-5/6 animate-pulse rounded bg-zinc-800/50" />
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-zinc-800/70" />
          <div className="h-3.5 w-1/3 animate-pulse rounded bg-zinc-800/50" />
        </div>
      )}
    </div>
  );
}

// ── Regex fallback (curl, fetch) ────────────────────────────────────────────

function RegexCodeBlock({ code, language }: {
  code: string;
  language: string;
}): React.ReactElement {
  const lines = code.split("\n");
  const gutterW = `${String(lines.length).length}ch`;

  return (
    <div className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="absolute right-2 top-2 z-10">
        <CopyButton value={code} label={`Copy ${language}`} />
      </div>
      <div className="max-h-72 overflow-auto py-3">
        {lines.map((line, i) => (
          <div key={i} className="flex px-3">
            <span
              className="mr-3 shrink-0 select-none text-right text-[10px] tabular-nums leading-relaxed text-zinc-600"
              style={{ minWidth: gutterW }}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 mono-sm whitespace-pre-wrap break-all leading-relaxed text-zinc-300">
              {highlightLine(line, language)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
