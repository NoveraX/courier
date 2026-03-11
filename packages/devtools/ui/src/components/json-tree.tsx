import { JsonNode } from "./json-tree-node"

interface JsonTreeProps {
  data: unknown
  searchQuery?: string
  defaultExpanded?: number
}

export function JsonTree({ data, searchQuery, defaultExpanded = 2 }: JsonTreeProps) {
  if (data === undefined || data === null) {
    return <span className="text-text-muted italic">null</span>
  }

  return (
    <div className="font-mono text-[11px] leading-relaxed">
      <JsonNode value={data} path="" depth={0} defaultExpanded={defaultExpanded} searchQuery={searchQuery} />
    </div>
  )
}
