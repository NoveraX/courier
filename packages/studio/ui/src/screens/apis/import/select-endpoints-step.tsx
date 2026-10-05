import { CircleCheck } from "lucide-react";

import { methodText } from "@/design/method-color";
import { TickBox } from "@/design/tick-box";
import { countSelectedEndpoints } from "@/features/apis/helpers";
import type { ParsedSpec } from "@/features/apis/types";
import { ownValue } from "@/lib/own-value";
import { cn } from "@/lib/utils";

const FORMAT: Readonly<Record<ParsedSpec["format"], string>> = {
  openapi3: "OpenAPI 3",
  swagger2: "Swagger 2.0",
  postman: "Postman",
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

interface SelectEndpointsStepProps {
  spec: ParsedSpec;
  selected: Record<string, string[]>;
  onToggleEndpoint: (group: string, endpoint: string) => void;
  onToggleGroup: (group: string) => void;
  onToggleAll: () => void;
}

/**
 * The Select step: the spec Studio read, the operations it left out, and
 * each group's endpoints to keep or leave out of the import.
 *
 * @param props - The spec, the endpoints picked, and what ticking an endpoint, a group or all does
 * @returns The step
 * @example
 * ```tsx
 * <SelectEndpointsStep spec={spec} selected={selected} onToggleEndpoint={toggle} onToggleGroup={toggleGroup} onToggleAll={toggleAll} />
 * ```
 */
export function SelectEndpointsStep({
  spec,
  selected,
  onToggleEndpoint,
  onToggleGroup,
  onToggleAll,
}: SelectEndpointsStepProps): React.ReactNode {
  const total = spec.groups.reduce((n, g) => n + g.endpoints.length, 0);
  const count = countSelectedEndpoints(selected);
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 flex flex-wrap items-center gap-2.5 rounded-panel border border-ok/30 bg-ok-dim px-3.25 py-2.75 text-control">
        <CircleCheck aria-hidden="true" className="size-3.5 text-ok" />
        <span className="font-semibold">{spec.title || "Untitled spec"}</span>
        <span className="text-fg-muted">
          {[
            FORMAT[spec.format],
            spec.version && `v${spec.version.replace(/^v/, "")}`,
            plural(total, "operation"),
            plural(spec.groups.length, "group"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </p>
      <div className="flex items-center gap-2.5">
        <h3 className="m-0 text-title font-semibold">Choose endpoints</h3>
        <span className="text-small text-fg-subtle">{`${count} of ${total} selected`}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onToggleAll}
          className="flex h-6.5 cursor-pointer items-center rounded-[6px] border border-line px-2.25 text-small text-fg-muted hover:border-line-strong hover:text-fg"
        >
          {count === total ? "Deselect all" : "Select all"}
        </button>
      </div>
      {spec.skipped.length > 0 && (
        <div className="flex flex-col gap-1 rounded-panel bg-warn-dim px-3 py-2.5">
          <p className="m-0 text-control text-warn">{`${plural(spec.skipped.length, "operation")} left out of this import`}</p>
          {spec.skipped.map((op) => (
            <span
              key={`${op.method} ${op.path}`}
              title={op.reason}
              className="font-mono text-badge text-fg-subtle"
            >{`${op.method} ${op.path}`}</span>
          ))}
        </div>
      )}
      {spec.groups.map((group) => {
        const picked = ownValue(selected, group.name) ?? [];
        const all = picked.length === group.endpoints.length;
        return (
          <section
            key={group.name}
            aria-label={`Group ${group.name}`}
            className="overflow-hidden rounded-[11px] border border-line"
          >
            <label className="flex h-9.5 cursor-pointer items-center gap-2.5 bg-panel-subtle px-3 hover:bg-raised">
              <TickBox
                checked={all}
                mixed={picked.length > 0 && !all}
                label={`Select ${group.name}`}
                onChange={() => onToggleGroup(group.name)}
              />
              <span className="font-mono text-control font-semibold">{group.name}</span>
              <span className="text-label text-fg-subtle">{`${picked.length}/${group.endpoints.length}`}</span>
            </label>
            {group.endpoints.map((op) => {
              const on = picked.includes(op.name);
              return (
                <label
                  key={op.name}
                  className={cn(
                    "grid h-8.5 cursor-pointer grid-cols-[15px_46px_minmax(0,1fr)] items-center gap-2.5 border-t border-line px-3 hover:bg-raised",
                    !on && "opacity-55",
                  )}
                >
                  <TickBox
                    checked={on}
                    label={`Select ${group.name}.${op.name}`}
                    onChange={() => onToggleEndpoint(group.name, op.name)}
                  />
                  <span
                    className={cn(
                      "font-mono text-meta font-semibold uppercase",
                      methodText(op.httpMethod.toUpperCase()),
                    )}
                  >
                    {op.httpMethod}
                  </span>
                  <span className="flex min-w-0 items-baseline gap-2.5 overflow-hidden whitespace-nowrap">
                    <span className="font-mono text-small">{op.name}</span>
                    <span className="truncate font-mono text-badge text-fg-subtle">{op.path}</span>
                  </span>
                </label>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
