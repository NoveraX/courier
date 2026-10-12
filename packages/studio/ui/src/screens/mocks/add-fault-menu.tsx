import { Plus } from "lucide-react";
import { DropdownMenu } from "radix-ui";

import { POP_MOTION } from "@/design/overlay-motion";
import type { FaultGroup } from "@/features/mocks/fault-catalogue";
import { FAULT_CATALOGUE, FAULT_GROUP_LABEL } from "@/features/mocks/fault-catalogue";
import { cn } from "@/lib/utils";

const GROUPS: readonly FaultGroup[] = ["server", "client", "connection"];

interface AddFaultMenuProps {
  /** The faults already chosen, which the menu leaves out. */
  taken: readonly string[];
  onAdd: (type: string) => void;
  /** What the button says. */
  label?: string | undefined;
  disabled?: boolean | undefined;
}

/**
 * A button that opens the faults a mock can inject — server errors, client
 * errors and faults of the connection, each with what it does — and adds
 * the one picked. The ones already chosen are left out.
 *
 * @param props - The faults chosen, what adding one does, the button's words, and whether it is off
 * @returns The button and its menu
 * @example
 * ```tsx
 * <AddFaultMenu taken={["500", "503"]} onAdd={(type) => add(type)} />
 * ```
 */
export function AddFaultMenu({
  taken,
  onAdd,
  label = "Add a fault",
  disabled = false,
}: AddFaultMenuProps): React.ReactNode {
  const left = FAULT_CATALOGUE.filter((look) => !taken.includes(look.type));
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        disabled={disabled || left.length === 0}
        className="flex h-7 w-fit cursor-pointer items-center gap-1.5 rounded-control px-2 text-small text-fg-muted hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-50 data-[state=open]:bg-raised pointer-coarse:h-9"
      >
        <Plus aria-hidden="true" className="size-3" />
        {label}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-50 max-h-[min(420px,var(--radix-dropdown-menu-content-available-height))] max-w-[calc(100vw-16px)] min-w-60 overflow-y-auto rounded-panel bg-panel p-1 shadow-overlay",
            POP_MOTION,
          )}
        >
          {GROUPS.map((group) => {
            const looks = left.filter((look) => look.group === group);
            if (looks.length === 0) return null;
            return (
              <DropdownMenu.Group key={group} className="pb-1 last:pb-0">
                <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-label font-medium text-fg-subtle">
                  {FAULT_GROUP_LABEL[group]}
                </DropdownMenu.Label>
                {looks.map((look) => (
                  <DropdownMenu.Item
                    key={look.type}
                    onSelect={() => onAdd(look.type)}
                    className="flex h-8 cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 text-control text-fg-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-fg pointer-coarse:h-10"
                  >
                    <span className="w-17 shrink-0 font-mono text-small text-fg">{look.label}</span>
                    <span className="truncate text-small text-fg-subtle">{look.sub}</span>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Group>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
