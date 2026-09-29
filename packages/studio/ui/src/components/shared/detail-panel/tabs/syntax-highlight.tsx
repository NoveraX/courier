// ── Token colors ──────────────────────────────────────────────────────────

type TokenType = "keyword" | "string" | "number" | "boolean" | "property" | "flag" | "builtin";

// Always rendered on a dark code-block background — no theme variants needed
const COLORS: Record<TokenType, string> = {
  keyword: "text-violet-400",
  builtin: "text-sky-300",
  string: "text-emerald-400",
  number: "text-sky-400",
  boolean: "text-amber-400",
  property: "text-cyan-400",
  flag: "text-amber-400",
};

// ── Language patterns (order = priority for overlaps) ─────────────────────

const JSON_PATTERNS: [RegExp, TokenType][] = [
  [/"(?:[^"\\]|\\.)*"\s*(?=:)/g, "property"],
  [/"(?:[^"\\]|\\.)*"/g, "string"],
  [/\b-?\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, "number"],
  [/\b(?:true|false|null)\b/g, "boolean"],
];

const PATTERNS: Record<string, [RegExp, TokenType][]> = {
  curl: [
    [/'(?:[^'\\]|\\.)*'/g, "string"],
    [/"(?:[^"\\]|\\.)*"/g, "string"],
    [/\bcurl\b/g, "builtin"],
    [/(?<=\s|^)-[A-Za-z]+/gm, "flag"],
  ],
  fetch: [
    [/"(?:[^"\\]|\\.)*"\s*(?=:)/g, "property"],
    [/"(?:[^"\\]|\\.)*"/g, "string"],
    [/\b(?:const|let|var|await|async)\b/g, "keyword"],
    [/\b(?:fetch|JSON|stringify|response)\b/g, "builtin"],
    [/\b\d+\.?\d*\b/g, "number"],
    [/\b(?:true|false|null|undefined)\b/g, "boolean"],
  ],
  json: JSON_PATTERNS,
};

// ── Tokenizer ─────────────────────────────────────────────────────────────

interface Match {
  start: number;
  end: number;
  type: TokenType;
}

export function highlightLine(code: string, language: string): React.ReactNode[] {
  const patterns = PATTERNS[language] ?? JSON_PATTERNS;
  const matches: Match[] = [];

  for (const [regex, type] of patterns) {
    for (const match of code.matchAll(regex)) {
      matches.push({ start: match.index, end: match.index + match[0].length, type });
    }
  }

  // First match at each position wins; longer match wins on ties
  matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  const nodes: React.ReactNode[] = [];
  let pos = 0;
  let key = 0;

  for (const m of matches) {
    if (m.start < pos) continue;
    if (m.start > pos) nodes.push(code.slice(pos, m.start));
    nodes.push(
      <span key={key++} className={COLORS[m.type]}>
        {code.slice(m.start, m.end)}
      </span>,
    );
    pos = m.end;
  }

  if (pos < code.length) nodes.push(code.slice(pos));
  return nodes;
}
