import { useState, useCallback, useRef, useEffect } from "react";
import { ChevronRight, Copy, Check } from "lucide-react";

// ── JSON Tree Viewer ─────────────────────────────────────────────────────────
// Collapsible, searchable, with path copy support

interface JsonTreeProps {
  data: unknown;
  searchQuery?: string;
  defaultExpanded?: number;
}

export function JsonTree({ data, searchQuery, defaultExpanded = 2 }: JsonTreeProps) {
  if (data === undefined || data === null) {
    return <span className="text-text-muted italic">null</span>;
  }

  return (
    <div className="font-mono text-[11px] leading-relaxed">
      <JsonNode value={data} path="" depth={0} defaultExpanded={defaultExpanded} searchQuery={searchQuery} />
    </div>
  );
}

// ── Node Component ───────────────────────────────────────────────────────────

function JsonNode({
  value,
  path,
  depth,
  keyName,
  defaultExpanded,
  searchQuery,
  isLast = true,
}: {
  value: unknown;
  path: string;
  depth: number;
  keyName?: string;
  defaultExpanded: number;
  searchQuery?: string;
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(depth < defaultExpanded);
  const [copied, setCopied] = useState(false);

  const isObject = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copyPath = useCallback(() => {
    navigator.clipboard.writeText(path);
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [path]);

  const matchesSearch = searchQuery
    ? (keyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (!isObject && String(value).toLowerCase().includes(searchQuery.toLowerCase())))
    : false;

  // Primitive values
  if (!isObject) {
    return (
      <div className={`group flex items-start gap-1 hover:bg-surface-1 rounded px-1 -mx-1 ${matchesSearch ? "bg-amber-500/10" : ""}`}>
        {keyName !== undefined && (
          <span className="text-violet-400 shrink-0">
            {JSON.stringify(keyName)}
            <span className="text-text-muted">: </span>
          </span>
        )}
        <PrimitiveValue value={value} searchQuery={searchQuery} />
        {!isLast && <span className="text-text-muted">,</span>}
        <button
          type="button"
          onClick={copyPath}
          className="ml-auto hidden shrink-0 text-text-muted hover:text-text-secondary group-hover:block"
          title={`Copy path: ${path}`}
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
        </button>
      </div>
    );
  }

  // Object / Array
  const entries = isArray ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, unknown>);
  const bracketOpen = isArray ? "[" : "{";
  const bracketClose = isArray ? "]" : "}";
  const count = entries.length;

  if (count === 0) {
    return (
      <div className="flex items-center gap-1">
        {keyName !== undefined && (
          <span className="text-violet-400">
            {JSON.stringify(keyName)}
            <span className="text-text-muted">: </span>
          </span>
        )}
        <span className="text-text-muted">{bracketOpen}{bracketClose}</span>
        {!isLast && <span className="text-text-muted">,</span>}
      </div>
    );
  }

  return (
    <div>
      <div
        className={`group flex cursor-pointer items-center gap-0.5 hover:bg-surface-1 rounded px-1 -mx-1 ${matchesSearch ? "bg-amber-500/10" : ""}`}
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          size={12}
          className={`shrink-0 text-text-muted transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
        />
        {keyName !== undefined && (
          <span className="text-violet-400">
            {JSON.stringify(keyName)}
            <span className="text-text-muted">: </span>
          </span>
        )}
        {!expanded && (
          <span className="text-text-muted">
            {bracketOpen}<span className="text-text-secondary">{count} {isArray ? (count === 1 ? "item" : "items") : (count === 1 ? "key" : "keys")}</span>{bracketClose}
            {!isLast && ","}
          </span>
        )}
        {expanded && <span className="text-text-muted">{bracketOpen}</span>}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); copyPath(); }}
          className="ml-auto hidden shrink-0 text-text-muted hover:text-text-secondary group-hover:block"
          title={`Copy path: ${path}`}
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
        </button>
      </div>
      {expanded && (
        <>
          <div className="ml-4 border-l border-border-subtle pl-1">
            {entries.map(([key, val], i) => (
              <JsonNode
                key={key}
                keyName={isArray ? undefined : key}
                value={val}
                path={path ? (isArray ? `${path}[${key}]` : `${path}.${key}`) : key}
                depth={depth + 1}
                defaultExpanded={defaultExpanded}
                searchQuery={searchQuery}
                isLast={i === count - 1}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 px-1 -mx-1">
            <span className="text-text-muted">{bracketClose}</span>
            {!isLast && <span className="text-text-muted">,</span>}
          </div>
        </>
      )}
    </div>
  );
}

// ── Primitive Value Renderer ─────────────────────────────────────────────────

function PrimitiveValue({ value, searchQuery }: { value: unknown; searchQuery?: string }) {
  if (value === null) return <span className="text-orange-400 italic">null</span>;
  if (value === undefined) return <span className="text-text-muted italic">undefined</span>;

  if (typeof value === "boolean") {
    return <span className="text-amber-400">{String(value)}</span>;
  }

  if (typeof value === "number") {
    return <span className="text-sky-400">{String(value)}</span>;
  }

  if (typeof value === "string") {
    const str = JSON.stringify(value);
    if (searchQuery && value.toLowerCase().includes(searchQuery.toLowerCase())) {
      return <span className="text-emerald-400">{highlightMatch(str, searchQuery)}</span>;
    }
    return <span className="text-emerald-400">{str}</span>;
  }

  return <span className="text-text-secondary">{String(value)}</span>;
}

function highlightMatch(text: string, query: string) {
  const lower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  const idx = lower.indexOf(queryLower);
  if (idx === -1) return text;

  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-500/30 text-amber-300 rounded-sm">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}
