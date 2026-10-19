import type { MouseEvent } from "react"

import { groupIcon } from "./group-icon"
import { SearchOptionRow } from "./search-option-row"
import type { SearchGroup, SearchOption } from "./search-types"

interface SearchListProps {
  /** The list's element id, which the search box drives. */
  id: string
  groups: readonly SearchGroup[]
  /** The position of the picked result among every result listed. */
  active: number
  onPoint: (at: number) => void
  onOpen: (option: SearchOption, event: MouseEvent<HTMLAnchorElement>) => void
}

/**
 * The element id of the result at a position of the list, which the
 * search box points its choice at.
 *
 * @param listId - The list's element id
 * @param at - The result's position among every result listed
 * @returns The id
 * @example
 * ```ts
 * optionDomId("search", 2) // "search-2"
 * ```
 */
export function optionDomId(listId: string, at: number): string {
  return `${listId}-${at}`
}

/**
 * Search's results, under the sections of the docs they belong to — each
 * group headed by its section's name and icon, as in the navigation.
 *
 * @param props - The groups, the picked result, and what pointing at a result and opening one do
 * @returns The list
 * @example
 * ```tsx
 * <SearchList id={id} groups={groups} active={0} onPoint={setChosen} onOpen={open} />
 * ```
 */
export function SearchList({ id, groups, active, onPoint, onOpen }: SearchListProps) {
  let at = 0
  return (
    <div id={id} role="listbox" aria-label="Results">
      {groups.map((group, index) => {
        const Icon = groupIcon(group)
        const headId = `${id}-group-${index}`
        return (
          <fieldset
            key={group.id}
            aria-labelledby={headId}
            className="m-0 min-w-0 border-0 p-0 pb-1"
          >
            <div className="flex h-8 items-center gap-1.75 px-2.75 pt-1.5 text-meta text-fg-subtle">
              <Icon aria-hidden="true" className="size-3.25 shrink-0" />
              <span id={headId} className="truncate font-medium text-fg-muted">
                {group.label}
              </span>
            </div>
            {group.options.map((option) => {
              const position = at++
              return (
                <SearchOptionRow
                  key={option.id}
                  option={option}
                  domId={optionDomId(id, position)}
                  selected={position === active}
                  onPoint={() => onPoint(position)}
                  onOpen={(event) => onOpen(option, event)}
                />
              )
            })}
          </fieldset>
        )
      })}
    </div>
  )
}
