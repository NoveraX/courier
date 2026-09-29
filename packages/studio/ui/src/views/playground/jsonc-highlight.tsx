/**
 * Tiny JSONC syntax highlighter used by the playground JSON editor overlay.
 *
 * Extracted from `json-editor.tsx` so the regex tables and the match-merging
 * logic live in their own module. Pure: returns React nodes that the editor
 * paints behind a transparent textarea.
 */

const JSONC_PATTERNS: [RegExp, string][] = [
  [/\/\/.*$/gm, "text-zinc-600 italic"], // comments (dimmed)
  [/"(?:[^"\\]|\\.)*"\s*(?=:)/g, "text-cyan-400"], // property keys
  [/"(?:[^"\\]|\\.)*"/g, "text-emerald-400"], // string values
  [/\b-?\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, "text-sky-400"], // numbers
  [/\b(?:true|false|null)\b/g, "text-amber-400"], // keywords
];

interface Match {
  start: number;
  end: number;
  cls: string;
}

/** Highlight a JSONC string into an array of React nodes. */
export function highlightJsonc(code: string): React.ReactNode[] {
  const matches: Match[] = [];

  for (const [regex, cls] of JSONC_PATTERNS) {
    regex.lastIndex = 0;
    for (const m of code.matchAll(regex)) {
      matches.push({ start: m.index, end: m.index + m[0].length, cls });
    }
  }

  // Sort by start, then by length (longest first) so wider matches win on overlap
  matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  const nodes: React.ReactNode[] = [];
  let pos = 0;
  let key = 0;

  for (const m of matches) {
    if (m.start < pos) continue;
    if (m.start > pos) nodes.push(code.slice(pos, m.start));
    nodes.push(
      <span key={key++} className={m.cls}>
        {code.slice(m.start, m.end)}
      </span>,
    );
    pos = m.end;
  }

  if (pos < code.length) nodes.push(code.slice(pos));
  return nodes;
}
