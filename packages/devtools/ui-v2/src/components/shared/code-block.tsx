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

// ── Code block ──────────────────────────────────────────────────────────────

export function CodeBlock({ code, language }: {
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
