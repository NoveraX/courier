import { useEffect, useState } from "react";
import type { HighlighterCore } from "shiki/core";

import { CopyButton } from "@/components/shared/copy-button";
import { highlightLine } from "@/components/shared/detail-panel/tabs/syntax-highlight";
import { SegmentedControl } from "@/components/shared/segmented-control";

// ── Format switcher ─────────────────────────────────────────────────────────

export interface FormatOption {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function FormatSwitcher({
  formats,
  active,
  onChange,
}: {
  formats: FormatOption[];
  active: string;
  onChange: (key: string) => void;
}): React.ReactElement {
  const options = formats.map((f) => ({ value: f.key, label: f.label, icon: f.icon }));
  return (
    <SegmentedControl options={options} value={active} onChange={onChange} iconSize="size-2.5" />
  );
}

// ── Shiki languages ──────────────────────────────────────────────────────────

const SHIKI_LANGS = new Set(["ts", "tsx", "js", "jsx", "typescript", "javascript", "json"]);
const SHIKI_THEME = "github-dark-default";

/*
 * Only the grammars and the theme a block shows are loaded, with Shiki's
 * JavaScript regex engine. The whole of Shiki, every grammar and theme with
 * it, was a 10 MB chunk Studio shipped, and the first block waited for all
 * of it.
 */
let highlighter: Promise<HighlighterCore> | undefined;

function loadHighlighter(): Promise<HighlighterCore> {
  highlighter ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(
    ([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
      createHighlighterCore({
        themes: [import("shiki/themes/github-dark-default.mjs")],
        langs: [
          import("shiki/langs/typescript.mjs"),
          import("shiki/langs/tsx.mjs"),
          import("shiki/langs/javascript.mjs"),
          import("shiki/langs/jsx.mjs"),
          import("shiki/langs/json.mjs"),
        ],
        engine: createJavaScriptRegexEngine(),
      }),
  );
  return highlighter;
}

// ── Code block ──────────────────────────────────────────────────────────────

export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: string;
}): React.ReactElement {
  if (SHIKI_LANGS.has(language)) {
    return <ShikiCodeBlock code={code} language={language} />;
  }
  return <RegexCodeBlock code={code} language={language} />;
}

// ── Shiki-powered block ─────────────────────────────────────────────────────

function ShikiCodeBlock({
  code,
  language,
}: {
  code: string;
  language: string;
}): React.ReactElement {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadHighlighter()
      .then((loaded) => loaded.codeToHtml(code, { lang: language, theme: SHIKI_THEME }))
      .then(
        (result: string) => {
          if (!cancelled) setHtml(result);
        },
        (error: unknown) => {
          console.warn("Studio could not highlight a code block; it is shown plain", error);
          if (!cancelled) setFailed(true);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (failed) return <RegexCodeBlock code={code} language={language} />;

  return (
    <div className="shiki-block relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="absolute right-2 top-2 z-10">
        <CopyButton value={code} label={`Copy ${language}`} />
      </div>
      {html ? (
        <div
          className="max-h-72 overflow-auto [&_pre]:bg-transparent! [&_pre]:py-3 [&_pre]:px-3 [&_code]:mono-sm [&_code]:leading-relaxed"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki's own markup, every token of the code escaped, for a language from a fixed list
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

function RegexCodeBlock({
  code,
  language,
}: {
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
          // biome-ignore lint/suspicious/noArrayIndexKey: the lines of one block of code, in order; a line's place is its identity
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
