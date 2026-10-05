import { Search } from "lucide-react";
import { useState } from "react";

import type { HeaderGroup } from "@/features/requests/header-groups";
import { HeaderGroupSection } from "./header-group-section";

function narrowed(group: HeaderGroup, filter: string): HeaderGroup {
  const needle = filter.trim().toLowerCase();
  if (!needle) return group;
  const rows = group.rows.filter((row) =>
    `${row.name} ${row.value}`.toLowerCase().includes(needle),
  );
  return { ...group, rows };
}

/**
 * The headers of a request a mock answered, by side — what the mock sent
 * back, then what it was sent — narrowed by a filter, with credentials
 * masked until revealed.
 *
 * @param props - The two sides
 * @returns The tab
 * @example
 * ```tsx
 * <MockHeadersTab groups={view.headers} />
 * ```
 */
export function MockHeadersTab({ groups }: { groups: readonly HeaderGroup[] }): React.ReactNode {
  const [filter, setFilter] = useState("");
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [revealed, setRevealed] = useState(false);
  const toggle = (key: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return (
    <div className="flex flex-col gap-3 px-4.5 pt-4.5 pb-7">
      <label className="flex h-8 items-center gap-2 rounded-card border border-line bg-inset px-2.5">
        <Search aria-hidden="true" className="size-3 text-fg-subtle" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter headers by name or value…"
          aria-label="Filter headers"
          className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
        />
      </label>
      {groups.map((group) => (
        <HeaderGroupSection
          key={group.key}
          group={narrowed(group, filter)}
          open={!closed.has(group.key)}
          revealed={revealed}
          onToggle={() => toggle(group.key)}
          onReveal={() => setRevealed((r) => !r)}
          filtered={filter.trim() !== ""}
        />
      ))}
    </div>
  );
}
