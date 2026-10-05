import { Command } from "cmdk";
import { Check, ChevronsUpDown, Search, Server } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";
import { POP_MOTION } from "@/design/overlay-motion";
import type { PlaygroundEndpoint } from "@/features/playground/endpoint-choices";
import { choiceRows } from "@/features/playground/endpoint-choices";
import { cn } from "@/lib/utils";
import { methodChipOf, methodClassOf } from "@/screens/explorer/method-class";

interface EndpointPickerProps {
  choices: readonly PlaygroundEndpoint[];
  current: PlaygroundEndpoint;
  onChoose: (endpoint: PlaygroundEndpoint) => void;
}

function groupsOf(
  rows: ReturnType<typeof choiceRows>,
): { source: string; endpoints: PlaygroundEndpoint[] }[] {
  const groups: { source: string; endpoints: PlaygroundEndpoint[] }[] = [];
  for (const row of rows) {
    if (row.kind === "source") groups.push({ source: row.source, endpoints: [] });
    else groups.at(-1)?.endpoints.push(row.endpoint);
  }
  return groups;
}

/**
 * The endpoint the Playground sends to, and the list it is chosen from:
 * every endpoint by source, searched by name or path and picked with the
 * keyboard or a click.
 *
 * @param props - The endpoints, the one chosen, and what choosing does
 * @returns The picker
 * @example
 * ```tsx
 * <EndpointPicker choices={choices} current={endpoint} onChoose={choose} />
 * ```
 */
export function EndpointPicker({
  choices,
  current,
  onChoose,
}: EndpointPickerProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const groups = groupsOf(choiceRows(choices, query));
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
      }}
    >
      <Popover.Trigger
        aria-label={`Endpoint: ${current.key}`}
        className="flex h-8.5 min-w-0 flex-[1_1_200px] cursor-pointer items-center gap-2.5 rounded-[9px] border border-line bg-panel pr-2.5 pl-1.5 text-left transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand data-[state=open]:border-line-strong"
      >
        <span
          className={cn(
            "flex h-5.5 shrink-0 items-center rounded-[6px] px-1.75 font-mono text-meta font-semibold",
            methodChipOf(current.label),
          )}
        >
          {current.label}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-ui">
          <span className="text-fg-subtle">
            {[current.source, current.group].filter(Boolean).join(" / ")} /{" "}
          </span>
          {current.method}
        </span>
        <ChevronsUpDown aria-hidden="true" className="size-3.25 shrink-0 text-fg-subtle" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className={cn(
            "z-50 w-[min(460px,calc(100vw-40px))] overflow-hidden rounded-dialog bg-panel shadow-overlay",
            POP_MOTION,
          )}
        >
          <Command loop shouldFilter={false} label="Endpoints">
            <div className="flex h-10.5 items-center gap-2 border-b border-line px-3">
              <Search aria-hidden="true" className="size-3.25 shrink-0 text-fg-subtle" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={`Search ${choices.length} endpoints…`}
                className="h-full min-w-0 flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-subtle"
              />
            </div>
            <Command.List className="max-h-90 overflow-auto p-1">
              <Command.Empty className="px-3 py-6 text-center text-control text-fg-subtle">
                No endpoint matches
              </Command.Empty>
              {groups.map((group) => (
                <Command.Group
                  key={group.source}
                  heading={
                    <span className="flex items-center gap-1.75">
                      <Server aria-hidden="true" className="size-2.75 text-syntax-type" />
                      {group.source}
                    </span>
                  }
                  className="**:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:pt-2.5 **:[[cmdk-group-heading]]:pb-1.25 **:[[cmdk-group-heading]]:font-mono **:[[cmdk-group-heading]]:text-badge **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:text-fg-subtle"
                >
                  {group.endpoints.map((endpoint) => (
                    <Command.Item
                      key={endpoint.key}
                      value={endpoint.key}
                      onSelect={() => {
                        onChoose(endpoint);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex h-8.5 cursor-pointer items-center gap-2.5 rounded-control px-2.5 data-[selected=true]:bg-raised",
                        endpoint.key === current.key && "bg-brand-tint",
                      )}
                    >
                      <span
                        className={cn(
                          "w-10 shrink-0 font-mono text-micro font-semibold",
                          methodClassOf(endpoint.label),
                        )}
                      >
                        {endpoint.label}
                      </span>
                      <span className="shrink-0 font-mono text-control">
                        {endpoint.group && (
                          <span className="text-fg-subtle">{endpoint.group}.</span>
                        )}
                        {endpoint.method}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-badge text-fg-subtle">
                        {endpoint.path}
                      </span>
                      <Check
                        aria-hidden="true"
                        className={cn(
                          "size-3.25 text-brand",
                          endpoint.key !== current.key && "opacity-0",
                        )}
                      />
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
