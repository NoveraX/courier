export function PrimitiveValue({ value, searchQuery }: { value: unknown; searchQuery?: string }) {
  if (value === null) return <span className="text-orange-400 italic">null</span>
  if (value === undefined) return <span className="text-text-muted italic">undefined</span>

  if (typeof value === "boolean") {
    return <span className="text-amber-400">{String(value)}</span>
  }

  if (typeof value === "number") {
    return <span className="text-sky-400">{String(value)}</span>
  }

  if (typeof value === "string") {
    const str = JSON.stringify(value)
    if (searchQuery && value.toLowerCase().includes(searchQuery.toLowerCase())) {
      return <span className="text-emerald-400">{highlightMatch(str, searchQuery)}</span>
    }
    return <span className="text-emerald-400">{str}</span>
  }

  return <span className="text-text-secondary">{String(value)}</span>
}

function highlightMatch(text: string, query: string) {
  const lower = text.toLowerCase()
  const queryLower = query.toLowerCase()
  const idx = lower.indexOf(queryLower)
  if (idx === -1) return text

  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-500/30 text-amber-300 rounded-sm">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}
