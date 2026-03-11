import { useState, useMemo, useEffect } from "react"

import type { ParsedSpec, ParsedGroup, GenerateOptions } from "./types"
import { groupKey } from "./helpers"
import { SelectHeaderInfo, SelectConfigFields, SelectSearchBar } from "./select-header"
import { EndpointTree } from "./endpoint-tree"

export function SelectStep({
  spec,
  selection,
  totalSelected,
  totalEndpoints,
  options,
  groupKeys,
  onToggleGroup,
  onToggleEndpoint,
  onSelectAll,
  onDeselectAll,
  onOptionsChange,
  onNext,
}: {
  spec: ParsedSpec
  selection: Record<string, Set<string>>
  totalSelected: number
  totalEndpoints: number
  options: GenerateOptions
  groupKeys: Map<ParsedGroup, string>
  onToggleGroup: (gKey: string) => void
  onToggleEndpoint: (gKey: string, e: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onOptionsChange: (o: GenerateOptions) => void
  onNext: () => void
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  const [search, setSearch] = useState("")

  const searchLower = search.toLowerCase()

  const filteredGroups = useMemo(() => {
    if (!searchLower) return spec.groups
    return spec.groups
      .map((group) => ({
        ...group,
        endpoints: group.endpoints.filter(
          (ep) =>
            ep.name.toLowerCase().includes(searchLower) ||
            ep.fullPath.toLowerCase().includes(searchLower) ||
            ep.description.toLowerCase().includes(searchLower) ||
            ep.httpMethod.toLowerCase().includes(searchLower)
        ),
      }))
      .filter((g) => g.endpoints.length > 0 || g.name.toLowerCase().includes(searchLower))
  }, [spec.groups, searchLower])

  useEffect(() => {
    if (searchLower) {
      const matching = new Set<string>()
      for (const group of filteredGroups) {
        const key = groupKeys.get(spec.groups.find((g) => g.name === group.name && g.prefix === group.prefix)!) ?? group.name
        if (group.endpoints.length > 0) matching.add(key)
      }
      setExpandedGroups(matching)
    }
  }, [searchLower, filteredGroups, groupKeys, spec.groups])

  function toggleExpand(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function expandAll() {
    setExpandedGroups(new Set(filteredGroups.map((g) => {
      const original = spec.groups.find((og) => og.name === g.name && og.prefix === g.prefix)
      return original ? (groupKeys.get(original) ?? g.name) : groupKey(g, filteredGroups.indexOf(g))
    })))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SelectHeaderInfo
        format={spec.format}
        title={spec.title}
        totalSelected={totalSelected}
        totalEndpoints={totalEndpoints}
        onNext={onNext}
      />

      <SelectConfigFields
        options={options}
        baseURL={spec.baseURL}
        onOptionsChange={onOptionsChange}
      />

      <SelectSearchBar
        search={search}
        setSearch={setSearch}
        onSelectAll={onSelectAll}
        onDeselectAll={onDeselectAll}
        onExpandAll={expandAll}
        onCollapseAll={() => setExpandedGroups(new Set())}
      />

      <EndpointTree
        filteredGroups={filteredGroups}
        allGroups={spec.groups}
        groupKeys={groupKeys}
        selection={selection}
        expandedGroups={expandedGroups}
        search={search}
        onToggleExpand={toggleExpand}
        onToggleGroup={onToggleGroup}
        onToggleEndpoint={onToggleEndpoint}
      />
    </div>
  )
}
