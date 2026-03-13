import type { ParsedGroup } from "./types"
import { EndpointRow, GroupHeader } from "./endpoint-tree-nodes"

export function EndpointTree({
  filteredGroups,
  allGroups,
  groupKeys,
  selection,
  expandedGroups,
  search,
  onToggleExpand,
  onToggleGroup,
  onToggleEndpoint,
}: {
  filteredGroups: ParsedGroup[]
  allGroups: ParsedGroup[]
  groupKeys: Map<ParsedGroup, string>
  selection: Record<string, Set<string>>
  expandedGroups: Set<string>
  search: string
  onToggleExpand: (key: string) => void
  onToggleGroup: (gKey: string) => void
  onToggleEndpoint: (gKey: string, e: string) => void
}) {
  function displayName(group: ParsedGroup): string {
    if (group.name) return group.name
    const last = group.prefix.split("/").filter(Boolean).pop()
    return last ? `[${last}]` : "[unnamed]"
  }

  return (
    <div className="rounded-lg border border-border-default">
      {filteredGroups.length === 0 && (
        <div className="px-4 py-8 text-center text-xs text-text-muted">
          No endpoints match "{search}"
        </div>
      )}
      {filteredGroups.map((group) => {
        const originalGroup = allGroups.find((g) => g.name === group.name && g.prefix === group.prefix)
        const gKey = originalGroup ? (groupKeys.get(originalGroup) ?? group.name) : group.name
        const groupSel = selection[gKey] ?? new Set()
        const fullGroup = originalGroup ?? group
        const allSelected = groupSel.size === fullGroup.endpoints.length && fullGroup.endpoints.length > 0
        const someSelected = groupSel.size > 0 && !allSelected
        const isExpanded = expandedGroups.has(gKey)

        return (
          <div key={gKey} className="border-b border-border-subtle last:border-b-0">
            <GroupHeader
              displayName={displayName(group)}
              prefix={group.prefix}
              description={group.description}
              endpointCount={fullGroup.endpoints.length}
              selectedCount={groupSel.size}
              allSelected={allSelected}
              someSelected={someSelected}
              isExpanded={isExpanded}
              onToggleExpand={() => onToggleExpand(gKey)}
              onToggleGroup={() => onToggleGroup(gKey)}
            />
            {isExpanded && (
              <div className="border-t border-border-subtle bg-surface-0">
                {group.endpoints.map((ep) => (
                  <EndpointRow
                    key={ep.name}
                    name={ep.name}
                    httpMethod={ep.httpMethod}
                    fullPath={ep.fullPath}
                    secured={ep.secured}
                    description={ep.description}
                    isSelected={groupSel.has(ep.name)}
                    onClick={() => onToggleEndpoint(gKey, ep.name)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
